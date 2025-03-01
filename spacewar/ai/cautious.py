"""
Cautious AI implementation for Spacewar ships.
Focuses on survival by better predicting and avoiding collisions.
"""
import math
import random
from typing import List, Tuple, Optional

from entities import Ship, Asteroid, DeliveryZone, SCREEN_WIDTH, SCREEN_HEIGHT, MAX_PICKUP_VELOCITY

from .base import BaseShipAI
from .utils import (
    predict_collision, 
    find_dangerous_asteroids, 
    get_angle_to_target,
    get_steering_direction
)

# AI Constants
DANGER_DISTANCE = 150  # Increased from original (100)
REACTION_DISTANCE = 200  # Increased from original (150)
PREDICTION_TIME = 90  # Increased from original (60)
COURSE_CHANGE_DELAY = 30

class CautiousShipAI(BaseShipAI):
    """
    A more cautious AI implementation that prioritizes survival.
    Better at predicting and avoiding collisions with asteroids.
    """
    
    def __init__(self, ship: Ship):
        super().__init__(ship)
        self.course_change_timer = 0
        self.current_target_angle = random.uniform(0, 360)
        self.current_mode = "cruise"
        self.target_zone = None
        self.safe_spot_x = None
        self.safe_spot_y = None
    
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
        
        # Find dangerous asteroids with extended prediction time
        dangerous_asteroids = self._find_dangerous_asteroids(asteroids)
        
        # Find closest asteroid and distance
        closest_asteroid, distance_to_closest = self._find_closest_asteroid(asteroids)
        
        # Default controls (no thrust, no rotation)
        thrust = 0
        rotation = 0
        
        # Check for delivery missions if reasonably safe
        if delivery_zones and len(dangerous_asteroids) <= 1:
            # Find appropriate zone based on ship's cargo status
            target_type = "dropoff" if self.ship.has_cargo else "pickup"
            suitable_zones = [z for z in delivery_zones if z.zone_type == target_type]
            
            if suitable_zones:
                # Find closest zone
                closest_zone = min(suitable_zones, key=lambda z: self.ship.get_distance(z))
                distance_to_zone = self.ship.get_distance(closest_zone)
                
                # Only pursue if zone is reasonably close and not too many threats
                if distance_to_zone < REACTION_DISTANCE * 2:
                    # Check if path to zone is safe
                    if not self._zone_path_has_threats(closest_zone, asteroids):
                        self.current_mode = target_type
                        self.target_zone = closest_zone
                        thrust, rotation = self._approach_zone_safely(closest_zone)
                        return thrust, rotation
        
        # Update mode based on threats
        if dangerous_asteroids:
            self.current_mode = "evade"
            self.target_zone = None
            
            # Look for a safe spot if multiple threats
            if len(dangerous_asteroids) > 1 and random.random() < 0.1:
                self._find_safe_spot(asteroids)
        elif closest_asteroid and distance_to_closest < REACTION_DISTANCE:
            self.current_mode = "avoid"
            self.target_zone = None
        else:
            # No immediate threats, cruise around
            if self.course_change_timer == 0 and self.current_mode not in ["pickup", "dropoff"]:
                self.current_mode = "cruise"
                self.target_zone = None
                self.safe_spot_x = None
                self.safe_spot_y = None
                
                # Set a new random target angle occasionally
                if random.random() < 0.01:
                    self.current_target_angle = random.uniform(0, 360)
                    self.course_change_timer = COURSE_CHANGE_DELAY
        
        # Apply behavior based on current mode
        if self.current_mode == "evade":
            if self.safe_spot_x is not None and self.safe_spot_y is not None:
                thrust, rotation = self._move_to_safe_spot()
            else:
                thrust, rotation = self._evade_asteroids_enhanced(dangerous_asteroids)
        elif self.current_mode == "avoid":
            thrust, rotation = self._avoid_asteroid_enhanced(closest_asteroid)
        elif self.current_mode in ["pickup", "dropoff"] and self.target_zone:
            thrust, rotation = self._approach_zone_safely(self.target_zone)
        else:  # cruise mode
            thrust, rotation = self._cruise_safely(asteroids)
        
        return thrust, rotation
    
    def get_description(self) -> str:
        """Return a human-readable description of this AI."""
        return "Cautious AI - Prioritizes survival with improved collision avoidance"
    
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
    
    def _find_dangerous_asteroids(self, asteroids: List[Asteroid]) -> List[Tuple[Asteroid, float, float]]:
        """Find asteroids on collision course with enhanced prediction."""
        dangerous = []
        
        for asteroid in asteroids:
            # Skip if too far away to be an immediate concern
            distance = self.ship.get_distance(asteroid)
            if distance > REACTION_DISTANCE:
                continue
            
            # Use the utility function for better prediction
            will_collide, time_to_collision = predict_collision(
                self.ship, asteroid, prediction_time=PREDICTION_TIME
            )
            
            if will_collide:
                dangerous.append((asteroid, distance, time_to_collision))
        
        # Sort by time to collision (most urgent first)
        dangerous.sort(key=lambda x: x[2])
        return dangerous
    
    def _zone_path_has_threats(self, zone: DeliveryZone, asteroids: List[Asteroid]) -> bool:
        """Check if the path to a delivery zone has threats."""
        # Direction vector from ship to zone
        dx = zone.x - self.ship.x
        dy = zone.y - self.ship.y
        
        # Normalize the vector
        distance = math.sqrt(dx*dx + dy*dy)
        if distance < 1:  # Already at zone
            return False
            
        dx /= distance
        dy /= distance
        
        # Check for asteroids along path
        for asteroid in asteroids:
            # Vector from ship to asteroid
            ax = asteroid.x - self.ship.x
            ay = asteroid.y - self.ship.y
            
            # Project asteroid vector onto path vector
            proj = ax * dx + ay * dy
            
            # If projection is negative, asteroid is behind ship
            if proj < 0:
                continue
                
            # If projection is greater than distance, asteroid is beyond zone
            if proj > distance:
                continue
                
            # Find closest point on path to asteroid
            closest_x = self.ship.x + dx * proj
            closest_y = self.ship.y + dy * proj
            
            # Distance from closest point to asteroid
            cx = closest_x - asteroid.x
            cy = closest_y - asteroid.y
            closest_dist = math.sqrt(cx*cx + cy*cy)
            
            # If asteroid is too close to path, consider it a threat
            if closest_dist < asteroid.size + self.ship.size + 20:
                return True
                
        return False
    
    def _find_safe_spot(self, asteroids: List[Asteroid]) -> None:
        """Find a safe spot away from asteroids."""
        # Sample random locations and find the one with greatest minimum distance to any asteroid
        best_min_distance = -1
        best_x, best_y = None, None
        
        for _ in range(20):  # Try 20 random spots
            x = random.uniform(0, SCREEN_WIDTH)
            y = random.uniform(0, SCREEN_HEIGHT)
            
            # Calculate minimum distance to any asteroid
            min_distance = float('inf')
            for asteroid in asteroids:
                dx = min(abs(x - asteroid.x), SCREEN_WIDTH - abs(x - asteroid.x))
                dy = min(abs(y - asteroid.y), SCREEN_HEIGHT - abs(y - asteroid.y))
                distance = math.sqrt(dx**2 + dy**2)
                min_distance = min(min_distance, distance)
            
            # Keep track of best spot
            if min_distance > best_min_distance:
                best_min_distance = min_distance
                best_x, best_y = x, y
        
        # If we found a good spot, set it as target
        if best_min_distance > DANGER_DISTANCE:
            self.safe_spot_x = best_x
            self.safe_spot_y = best_y
    
    def _move_to_safe_spot(self) -> Tuple[int, int]:
        """Move toward the identified safe spot."""
        if self.safe_spot_x is None or self.safe_spot_y is None:
            return 0, 0
            
        # Calculate angle to safe spot
        target_angle = get_angle_to_target(self.ship, self.safe_spot_x, self.safe_spot_y)
        
        # Get steering direction
        ship_angle = self.ship.angle % 360
        rotation = get_steering_direction(ship_angle, target_angle)
        
        # Calculate distance to safe spot
        dx = min(abs(self.ship.x - self.safe_spot_x), SCREEN_WIDTH - abs(self.ship.x - self.safe_spot_x))
        dy = min(abs(self.ship.y - self.safe_spot_y), SCREEN_HEIGHT - abs(self.ship.y - self.safe_spot_y))
        distance = math.sqrt(dx**2 + dy**2)
        
        # Apply thrust if pointing in roughly correct direction
        thrust = 1 if abs((target_angle - ship_angle + 180) % 360 - 180) < 45 else 0
        
        # Clear safe spot if we've reached it
        if distance < 50:
            self.safe_spot_x = None
            self.safe_spot_y = None
            
        return thrust, rotation
    
    def _evade_asteroids_enhanced(self, dangerous_asteroids: List[Tuple[Asteroid, float, float]]) -> Tuple[int, int]:
        """Enhanced evasive action from asteroids on collision course."""
        if not dangerous_asteroids:
            return 0, 0
            
        # If multiple threats, consider them together for better evasion
        if len(dangerous_asteroids) > 1:
            # Find average approach vector of all nearby threats
            avg_vx, avg_vy = 0, 0
            total_weight = 0
            
            for asteroid, distance, time in dangerous_asteroids[:3]:  # Consider up to 3 most urgent threats
                # Weight by urgency (inverse of time to collision)
                weight = 1 / max(time, 1)
                
                # Normalized vector from ship to asteroid
                dx = asteroid.x - self.ship.x
                dy = asteroid.y - self.ship.y
                dist = max(math.sqrt(dx*dx + dy*dy), 0.1)
                dx /= dist
                dy /= dist
                
                avg_vx += dx * weight
                avg_vy += dy * weight
                total_weight += weight
            
            # Normalize
            if total_weight > 0:
                avg_vx /= total_weight
                avg_vy /= total_weight
                
                # Escape direction is opposite to average approach
                escape_angle = math.atan2(-avg_vy, -avg_vx)
                escape_angle_deg = math.degrees(escape_angle) % 360
                
                # Determine rotation direction
                ship_angle = self.ship.angle % 360
                angle_diff = (escape_angle_deg - ship_angle + 180) % 360 - 180
                
                # Apply controls - full thrust in emergency
                thrust = 1
                rotation = 0 if abs(angle_diff) < 10 else (1 if angle_diff > 0 else -1)
                
                return thrust, rotation
        
        # Fall back to original strategy for single threat
        asteroid, distance, _ = dangerous_asteroids[0]
        
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
        
        # Apply controls - always thrust in emergency, but with stronger rotation
        thrust = 1
        if abs(angle_diff) < 5:  # Tighter angle threshold
            rotation = 0
        elif angle_diff > 0:
            rotation = 1  # Rotate clockwise
        else:
            rotation = -1  # Rotate counter-clockwise
            
        return thrust, rotation
    
    def _avoid_asteroid_enhanced(self, asteroid: Asteroid) -> Tuple[int, int]:
        """Enhanced asteroid avoidance with better distance management."""
        if not asteroid:
            return 0, 0
            
        # Calculate direction from asteroid to ship
        angle_to_asteroid = math.atan2(asteroid.y - self.ship.y, asteroid.x - self.ship.x)
        
        # Target angle is away from the asteroid
        target_angle = (angle_to_asteroid + math.pi) % (2 * math.pi)  # Opposite direction
        target_angle_deg = math.degrees(target_angle)
        
        # Determine rotation direction
        ship_angle = self.ship.angle % 360
        angle_diff = (target_angle_deg - ship_angle + 180) % 360 - 180
        
        # Apply avoidance controls with enhanced distance sensitivity
        distance = self.ship.get_distance(asteroid)
        
        # More aggressive scaling - thrust harder at greater distances
        thrust_intensity = 1.0 - min(1.0, (distance - self.ship.size - asteroid.size) / 
                                  (REACTION_DISTANCE * 0.7))  # Smaller denominator for more sensitivity
        
        # Start thrusting earlier
        thrust = 1 if thrust_intensity > 0.2 else 0  # Lower threshold (0.3 in original)
        
        # More responsive rotation - tighter angle threshold
        if abs(angle_diff) < 10:  # Original was 15
            rotation = 0
        elif angle_diff > 0:
            rotation = 1
        else:
            rotation = -1
            
        return thrust, rotation
    
    def _approach_zone_safely(self, zone: DeliveryZone) -> Tuple[int, int]:
        """Approach a delivery zone safely with enhanced deceleration."""
        # Calculate angle to zone
        angle_to_zone = math.degrees(math.atan2(zone.y - self.ship.y, zone.x - self.ship.x)) % 360
        
        # Determine rotation direction
        ship_angle = self.ship.angle % 360
        angle_diff = (angle_to_zone - ship_angle + 180) % 360 - 180
        
        # Calculate distance and current speed
        distance = self.ship.get_distance(zone)
        current_speed = math.sqrt(self.ship.velocity_x**2 + self.ship.velocity_y**2)
        
        # Enhanced speed control based on distance
        if distance < zone.size:
            # Inside zone, prioritize slowing down
            if current_speed > MAX_PICKUP_VELOCITY * 0.7:  # More aggressive threshold
                # Need to brake - thrust in opposite direction
                movement_angle = math.degrees(math.atan2(self.ship.velocity_y, self.ship.velocity_x)) % 360
                braking_angle = (movement_angle + 180) % 360
                
                # Get rotation toward braking angle
                brake_angle_diff = (braking_angle - ship_angle + 180) % 360 - 180
                
                if abs(brake_angle_diff) < 60:  # Wider angle for braking
                    # Apply brake thrust if roughly pointing in brake direction
                    return 1, get_steering_direction(ship_angle, braking_angle)
                else:
                    # Rotate toward brake direction without thrust
                    return 0, get_steering_direction(ship_angle, braking_angle)
            else:
                # Slow enough for pickup/dropoff
                return 0, 0
        else:
            # Start braking earlier
            braking_distance = current_speed * 10  # Simple braking distance estimate
            
            if distance < braking_distance:
                # We're close enough that we should start slowing down
                if current_speed > MAX_PICKUP_VELOCITY * 1.5:
                    # Need to slow down - don't thrust
                    return 0, get_steering_direction(ship_angle, angle_to_zone)
            
            # Normal approach - thrust if pointing in the right direction
            if abs(angle_diff) < 30:  # Only thrust when well-aligned
                return 1, get_steering_direction(ship_angle, angle_to_zone)
            else:
                return 0, get_steering_direction(ship_angle, angle_to_zone)
    
    def _cruise_safely(self, asteroids: List[Asteroid]) -> Tuple[int, int]:
        """Cruise around safely, avoiding potential collisions."""
        # Check if any asteroids are in our path
        current_speed = math.sqrt(self.ship.velocity_x**2 + self.ship.velocity_y**2)
        
        # Look ahead for obstacles in our path
        ship_angle_rad = math.radians(self.ship.angle)
        look_ahead = current_speed * 10  # Look ahead proportional to speed
        
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
        
        # Determine rotation direction to reach target angle
        ship_angle = self.ship.angle % 360
        rotation = get_steering_direction(ship_angle, self.current_target_angle)
        
        # Apply occasional thrust if moving slowly and no obstacles ahead
        thrust = 1 if random.random() < 0.1 and current_speed < 1.5 else 0
        
        return thrust, rotation