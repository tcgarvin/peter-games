"""
Delivery-focused AI implementation for Spacewar ships.
Specializes in efficiently picking up and delivering cargo.
"""
import math
import random
from typing import List, Tuple, Optional

from entities import Ship, Asteroid, DeliveryZone, SCREEN_WIDTH, SCREEN_HEIGHT, MAX_PICKUP_VELOCITY

from .base import BaseShipAI
from .utils import (
    get_angle_to_target,
    get_steering_direction,
    find_closest_zone_by_type,
    should_pursue_delivery,
    estimate_braking_distance
)

# AI Constants
DANGER_DISTANCE = 100
REACTION_DISTANCE = 150
PREDICTION_TIME = 60
COURSE_CHANGE_DELAY = 30

class DeliveryFocusedAI(BaseShipAI):
    """
    An AI implementation focused on efficient cargo delivery.
    Optimized for precise zone approaches and speed control.
    """
    
    def __init__(self, ship: Ship):
        super().__init__(ship)
        self.course_change_timer = 0
        self.current_target_angle = random.uniform(0, 360)
        self.current_mode = "cruise"
        self.target_zone = None
        self.approach_phase = "direct"  # direct, brake, final
        self.braking_started = False
    
    def make_decision(self, 
                     asteroids: List[Asteroid], 
                     other_ships: List[Ship], 
                     delivery_zones: Optional[List[DeliveryZone]] = None) -> Tuple[int, int]:
        """
        Make a decision on ship controls based on environment.
        Returns: (thrust, rotation)
        """
        # Decrement timer for course changes
        if self.course_change_timer > 0:
            self.course_change_timer -= 1
        
        # Find the closest asteroid and dangerous asteroids
        closest_asteroid, distance_to_closest = self._find_closest_asteroid(asteroids)
        dangerous_asteroids = self._find_dangerous_asteroids(asteroids)
        
        # Default controls (no thrust, no rotation)
        thrust = 0
        rotation = 0
        
        # Check for delivery missions with high priority if not in immediate danger
        if delivery_zones and not dangerous_asteroids:
            # Find appropriate zone based on ship's cargo status
            target_type = "dropoff" if self.ship.has_cargo else "pickup"
            
            # No suitable zones
            if not any(z.zone_type == target_type for z in delivery_zones):
                # If we have cargo but no dropoff, wait in safe spot
                if self.ship.has_cargo:
                    self.current_mode = "wait_for_dropoff"
                    thrust, rotation = self._cruise_safely(asteroids)
                    return thrust, rotation
            else:
                # Get closest appropriate zone
                closest_zone, distance_to_zone = find_closest_zone_by_type(
                    self.ship, delivery_zones, target_type
                )
                
                if closest_zone:
                    # Almost always pursue delivery missions
                    self.current_mode = target_type
                    self.target_zone = closest_zone
                    thrust, rotation = self._precision_approach(closest_zone)
                    return thrust, rotation
        
        # Update mode based on threats
        if dangerous_asteroids:
            self.current_mode = "evade"
            self.target_zone = None
            self.approach_phase = "direct"
            self.braking_started = False
        elif closest_asteroid and distance_to_closest < REACTION_DISTANCE:
            self.current_mode = "avoid"
            self.target_zone = None
            self.approach_phase = "direct"
            self.braking_started = False
        else:
            # No immediate threats, cruise around looking for delivery opportunities
            if self.course_change_timer == 0 and self.current_mode not in ["pickup", "dropoff"]:
                self.current_mode = "cruise"
                self.target_zone = None
                self.approach_phase = "direct"
                self.braking_started = False
                
                # Set a new random target angle occasionally
                if random.random() < 0.01:
                    self.current_target_angle = random.uniform(0, 360)
                    self.course_change_timer = COURSE_CHANGE_DELAY
        
        # Apply behavior based on current mode
        if self.current_mode == "evade":
            thrust, rotation = self._evade_asteroids(dangerous_asteroids)
        elif self.current_mode == "avoid":
            thrust, rotation = self._avoid_asteroid(closest_asteroid)
        elif self.current_mode in ["pickup", "dropoff"] and self.target_zone:
            thrust, rotation = self._precision_approach(self.target_zone)
        else:  # cruise mode - look for potential delivery zones
            thrust, rotation = self._cruise_delivery_focused(asteroids, delivery_zones)
        
        return thrust, rotation
    
    def get_description(self) -> str:
        """Return a human-readable description of this AI."""
        return "Delivery AI - Optimized for efficient cargo delivery with precise speed control"
    
    def _find_closest_asteroid(self, asteroids: List[Asteroid]) -> Tuple[Optional[Asteroid], float]:
        """Find the closest asteroid and its distance"""
        closest = None
        min_distance = float('inf')
        
        for asteroid in asteroids:
            distance = self.ship.get_distance(asteroid)
            if distance < min_distance:
                min_distance = distance
                closest = asteroid
                
        return closest, min_distance if closest else float('inf')
    
    def _find_dangerous_asteroids(self, asteroids: List[Asteroid]) -> List[Tuple[Asteroid, float]]:
        """Find asteroids on collision course with the ship"""
        dangerous = []
        
        for asteroid in asteroids:
            # Skip if too far away to be an immediate concern
            distance = self.ship.get_distance(asteroid)
            if distance > REACTION_DISTANCE:
                continue
                
            # Predict future positions
            ship_future_x = self.ship.x + self.ship.velocity_x * PREDICTION_TIME
            ship_future_y = self.ship.y + self.ship.velocity_y * PREDICTION_TIME
            
            asteroid_future_x = asteroid.x + asteroid.velocity_x * PREDICTION_TIME
            asteroid_future_y = asteroid.y + asteroid.velocity_y * PREDICTION_TIME
            
            # Handle screen wrapping in prediction
            if ship_future_x < 0:
                ship_future_x += SCREEN_WIDTH
            elif ship_future_x > SCREEN_WIDTH:
                ship_future_x -= SCREEN_WIDTH
                
            if ship_future_y < 0:
                ship_future_y += SCREEN_HEIGHT
            elif ship_future_y > SCREEN_HEIGHT:
                ship_future_y -= SCREEN_HEIGHT
                
            if asteroid_future_x < 0:
                asteroid_future_x += SCREEN_WIDTH
            elif asteroid_future_x > SCREEN_WIDTH:
                asteroid_future_x -= SCREEN_WIDTH
                
            if asteroid_future_y < 0:
                asteroid_future_y += SCREEN_HEIGHT
            elif asteroid_future_y > SCREEN_HEIGHT:
                asteroid_future_y -= SCREEN_HEIGHT
            
            # Calculate future distance
            future_dx = min(abs(ship_future_x - asteroid_future_x), 
                           SCREEN_WIDTH - abs(ship_future_x - asteroid_future_x))
            future_dy = min(abs(ship_future_y - asteroid_future_y), 
                           SCREEN_HEIGHT - abs(ship_future_y - asteroid_future_y))
            future_distance = math.sqrt(future_dx**2 + future_dy**2)
            
            # Check if there's a danger of collision
            if future_distance < (self.ship.size + asteroid.size + 10):
                dangerous.append((asteroid, distance))
        
        # Sort by distance (closest first)
        dangerous.sort(key=lambda x: x[1])
        return dangerous
    
    def _evade_asteroids(self, dangerous_asteroids: List[Tuple[Asteroid, float]]) -> Tuple[int, int]:
        """Emergency evasive action from asteroids on collision course"""
        if not dangerous_asteroids:
            return 0, 0
            
        # Focus on the closest dangerous asteroid
        asteroid, distance = dangerous_asteroids[0]
        
        # Calculate relative velocity
        rel_vel_x = asteroid.velocity_x - self.ship.velocity_x
        rel_vel_y = asteroid.velocity_y - self.ship.velocity_y
        
        # Find direction perpendicular to approach vector
        if abs(rel_vel_x) < 0.01 and abs(rel_vel_y) < 0.01:
            # If relative velocity is very small, just move away from asteroid
            escape_angle = math.atan2(self.ship.y - asteroid.y, self.ship.x - asteroid.x)
        else:
            # Otherwise, move perpendicular to approach vector
            approach_angle = math.atan2(rel_vel_y, rel_vel_x)
            # Choose the perpendicular direction that moves away from asteroid center
            perp1 = approach_angle + math.pi/2
            perp2 = approach_angle - math.pi/2
            
            # Calculate which perpendicular is better
            asteroid_angle = math.atan2(asteroid.y - self.ship.y, asteroid.x - self.ship.x)
            diff1 = abs((perp1 - asteroid_angle + math.pi) % (2 * math.pi) - math.pi)
            diff2 = abs((perp2 - asteroid_angle + math.pi) % (2 * math.pi) - math.pi)
            
            escape_angle = perp1 if diff1 > diff2 else perp2
        
        # Convert to degrees for ship control
        escape_angle_deg = math.degrees(escape_angle) % 360
        
        # Determine rotation direction
        ship_angle = self.ship.angle % 360
        angle_diff = (escape_angle_deg - ship_angle + 180) % 360 - 180
        
        # Apply controls
        thrust = 1  # Always thrust in emergency
        if abs(angle_diff) < 10:  # Close enough to desired angle
            rotation = 0
        elif angle_diff > 0:
            rotation = 1  # Rotate clockwise
        else:
            rotation = -1  # Rotate counter-clockwise
            
        return thrust, rotation
    
    def _avoid_asteroid(self, asteroid: Asteroid) -> Tuple[int, int]:
        """Avoid getting too close to an asteroid"""
        if not asteroid:
            return 0, 0
            
        # Calculate direction from asteroid to ship
        angle_to_asteroid = math.atan2(asteroid.y - self.ship.y, asteroid.x - self.ship.x)
        
        # Target angle is away from the asteroid
        target_angle = (angle_to_asteroid + math.pi) % (2 * math.pi)  # Opposite direction
        target_angle_deg = math.degrees(target_angle)
        
        # Determine rotation direction
        ship_angle = self.ship.angle % 360
        rotation = get_steering_direction(ship_angle, target_angle_deg)
        
        # Apply avoidance controls
        distance = self.ship.get_distance(asteroid)
        thrust_intensity = 1.0 - min(1.0, (distance - self.ship.size - asteroid.size) / 
                                    (REACTION_DISTANCE - self.ship.size - asteroid.size))
        
        thrust = 1 if thrust_intensity > 0.3 else 0
        
        return thrust, rotation
    
    def _precision_approach(self, zone: DeliveryZone) -> Tuple[int, int]:
        """
        Approach a delivery zone with precise speed control for pickup/dropoff.
        Uses a phased approach to gradually slow down.
        """
        # Calculate angle to zone and distance
        angle_to_zone = get_angle_to_target(self.ship, zone.x, zone.y)
        distance = self.ship.get_distance(zone)
        
        # Current speed
        velocity = math.sqrt(self.ship.velocity_x**2 + self.ship.velocity_y**2)
        
        # Get steering direction
        ship_angle = self.ship.angle % 360
        rotation = get_steering_direction(ship_angle, angle_to_zone)
        
        # ===== Phase-based approach logic =====
        
        # Phase 1: Inside zone - precise stop
        if distance < zone.size * 0.8:
            self.approach_phase = "final"
            
            # Inside zone, need to be very precise with speed
            if velocity > MAX_PICKUP_VELOCITY * 0.8:
                # Too fast - need to brake
                # Get braking angle (opposite of movement direction)
                movement_angle = math.degrees(math.atan2(self.ship.velocity_y, self.ship.velocity_x)) % 360
                braking_angle = (movement_angle + 180) % 360
                
                # Determine if we're facing in a good direction to brake
                brake_angle_diff = abs((braking_angle - ship_angle + 180) % 360 - 180)
                
                if brake_angle_diff < 30:
                    # Facing in a good direction to brake - apply thrust
                    return 1, 0
                else:
                    # Need to rotate to face brake direction
                    return 0, get_steering_direction(ship_angle, braking_angle)
            else:
                # Speed is good - hold position
                return 0, 0
                
        # Phase 2: Braking distance - slow down
        elif not self.braking_started:
            # Estimate braking distance based on current speed
            braking_distance = estimate_braking_distance(self.ship, MAX_PICKUP_VELOCITY * 0.8)
            
            # Start braking at 1.5x the calculated distance to be safe
            if distance < braking_distance * 1.5:
                self.approach_phase = "brake"
                self.braking_started = True
                
                # Initial braking - cut thrust and align to zone
                return 0, rotation
        
        # Phase 3: Active braking
        if self.approach_phase == "brake":
            # Check if we need to apply reverse thrust
            if velocity > MAX_PICKUP_VELOCITY:
                # Get movement direction and brake angle
                movement_angle = math.degrees(math.atan2(self.ship.velocity_y, self.ship.velocity_x)) % 360
                braking_angle = (movement_angle + 180) % 360
                
                # Get current alignment with brake direction
                brake_angle_diff = abs((braking_angle - ship_angle + 180) % 360 - 180)
                
                # Threshold of 90 degrees - wider for more responsive braking
                if brake_angle_diff < 90:
                    # We're roughly aligned for braking - apply reverse thrust
                    return 1, get_steering_direction(ship_angle, braking_angle)
                else:
                    # Turn to brake direction
                    return 0, get_steering_direction(ship_angle, braking_angle)
            else:
                # Speed is good enough - transition to direct approach
                self.approach_phase = "direct"
                return 0, rotation
        
        # Phase 4: Direct approach
        # Default direct approach - align with target and thrust if not too fast
        # Only thrust if:
        # 1. Well aligned with target
        # 2. Not going too fast
        # 3. Not too close to target
        if abs((angle_to_zone - ship_angle + 180) % 360 - 180) < 20 and velocity < 3 and distance > zone.size * 2:
            return 1, rotation
        else:
            return 0, rotation
    
    def _cruise_delivery_focused(self, asteroids: List[Asteroid], 
                               delivery_zones: Optional[List[DeliveryZone]]) -> Tuple[int, int]:
        """Cruise around with a focus on finding delivery opportunities."""
        # Current speed
        current_speed = math.sqrt(self.ship.velocity_x**2 + self.ship.velocity_y**2)
        
        # If there are active delivery zones but out of direct targeting range, head in that direction
        if delivery_zones:
            target_type = "dropoff" if self.ship.has_cargo else "pickup"
            suitable_zones = [z for z in delivery_zones if z.zone_type == target_type]
            
            if suitable_zones:
                # Find closest suitable zone
                closest_zone = min(suitable_zones, key=lambda z: self.ship.get_distance(z))
                
                # Head in general direction of zone
                angle_to_zone = get_angle_to_target(self.ship, closest_zone.x, closest_zone.y)
                ship_angle = self.ship.angle % 360
                rotation = get_steering_direction(ship_angle, angle_to_zone)
                
                # Thrust if aligned and not going too fast
                if abs((angle_to_zone - ship_angle + 180) % 360 - 180) < 30 and current_speed < 3:
                    return 1, rotation
                else:
                    return 0, rotation
        
        # Default cruising behavior - occasional random course changes
        ship_angle = self.ship.angle % 360
        angle_diff = (self.current_target_angle - ship_angle + 180) % 360 - 180
        
        # Apply cruising controls - occasional thrust if moving slowly
        thrust = 1 if random.random() < 0.2 and current_speed < 2 else 0
        
        # Get rotation direction
        if abs(angle_diff) < 5:
            rotation = 0
        elif angle_diff > 0:
            rotation = 1
        else:
            rotation = -1
            
        return thrust, rotation
    
    def _cruise_safely(self, asteroids: List[Asteroid]) -> Tuple[int, int]:
        """Cruise around safely while waiting for delivery opportunities."""
        # Check if any asteroids are in our path
        ship_angle_rad = math.radians(self.ship.angle)
        look_ahead = 100  # Fixed distance to look ahead
        
        # Point ahead of ship
        ahead_x = self.ship.x + math.cos(ship_angle_rad) * look_ahead
        ahead_y = self.ship.y + math.sin(ship_angle_rad) * look_ahead
        
        # Check for asteroids near that point
        for asteroid in asteroids:
            dx = min(abs(ahead_x - asteroid.x), SCREEN_WIDTH - abs(ahead_x - asteroid.x))
            dy = min(abs(ahead_y - asteroid.y), SCREEN_HEIGHT - abs(ahead_y - asteroid.y))
            obstacle_distance = math.sqrt(dx*dx + dy*dy)
            
            if obstacle_distance < asteroid.size + self.ship.size + 20:
                # Obstacle detected, change course
                new_angle = random.uniform(0, 360)
                self.current_target_angle = new_angle
                self.course_change_timer = COURSE_CHANGE_DELAY
                break
        
        # Current speed
        current_speed = math.sqrt(self.ship.velocity_x**2 + self.ship.velocity_y**2)
        
        # Determine rotation direction to reach target angle
        ship_angle = self.ship.angle % 360
        angle_diff = (self.current_target_angle - ship_angle + 180) % 360 - 180
        
        # Get rotation
        rotation = get_steering_direction(ship_angle, self.current_target_angle)
        
        # Apply occasional thrust if moving slowly
        thrust = 1 if random.random() < 0.05 and current_speed < 1 else 0
        
        return thrust, rotation