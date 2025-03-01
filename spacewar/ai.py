import math
import random
from typing import List, Tuple, Dict, Any

from entities import Ship, Asteroid, SCREEN_WIDTH, SCREEN_HEIGHT

# AI Constants
DANGER_DISTANCE = 100  # Distance at which asteroid is considered a threat
REACTION_DISTANCE = 150  # Distance at which AI starts to react to asteroids
PREDICTION_TIME = 60  # Frames to look ahead for collision prediction
COURSE_CHANGE_DELAY = 30  # Minimum frames between major course changes

class ShipAI:
    """Base AI class for controlling ships"""
    
    def __init__(self, ship: Ship):
        self.ship = ship
        self.course_change_timer = 0
        self.current_target_angle = random.uniform(0, 360)
        self.current_mode = "cruise"  # cruise, avoid, evade
    
    def make_decision(self, asteroids: List[Asteroid], other_ships: List[Ship]) -> Tuple[int, int]:
        """
        Make a decision on ship controls based on environment
        Returns: (thrust, rotation)
        """
        # Decrement timer for course changes
        if self.course_change_timer > 0:
            self.course_change_timer -= 1
        
        # Find the closest and most dangerous asteroids
        closest_asteroid, distance_to_closest = self._find_closest_asteroid(asteroids)
        dangerous_asteroids = self._find_dangerous_asteroids(asteroids)
        
        # Default controls (no thrust, no rotation)
        thrust = 0
        rotation = 0
        
        # Update mode based on threats
        if dangerous_asteroids:
            self.current_mode = "evade"
        elif closest_asteroid and distance_to_closest < REACTION_DISTANCE:
            self.current_mode = "avoid"
        else:
            # No immediate threats, cruise around
            if self.course_change_timer == 0:
                self.current_mode = "cruise"
                # Set a new random target angle occasionally
                if random.random() < 0.01:
                    self.current_target_angle = random.uniform(0, 360)
                    self.course_change_timer = COURSE_CHANGE_DELAY
        
        # Apply behavior based on current mode
        if self.current_mode == "evade":
            thrust, rotation = self._evade_asteroids(dangerous_asteroids)
        elif self.current_mode == "avoid":
            thrust, rotation = self._avoid_asteroid(closest_asteroid)
        else:  # cruise mode
            thrust, rotation = self._cruise(asteroids)
        
        return thrust, rotation
    
    def _find_closest_asteroid(self, asteroids: List[Asteroid]) -> Tuple[Asteroid, float]:
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
        angle_diff = (target_angle_deg - ship_angle + 180) % 360 - 180
        
        # Apply avoidance controls
        distance = self.ship.get_distance(asteroid)
        thrust_intensity = 1.0 - min(1.0, (distance - self.ship.size - asteroid.size) / (REACTION_DISTANCE - self.ship.size - asteroid.size))
        
        thrust = 1 if thrust_intensity > 0.3 else 0
        
        if abs(angle_diff) < 15:  # Close enough to desired angle
            rotation = 0
        elif angle_diff > 0:
            rotation = 1
        else:
            rotation = -1
            
        return thrust, rotation
    
    def _cruise(self, asteroids: List[Asteroid]) -> Tuple[int, int]:
        """Normal cruising behavior when no immediate threats"""
        # Determine rotation direction to reach target angle
        ship_angle = self.ship.angle % 360
        angle_diff = (self.current_target_angle - ship_angle + 180) % 360 - 180
        
        # Calculate thrust based on current speed
        current_speed = math.sqrt(self.ship.velocity_x**2 + self.ship.velocity_y**2)
        
        # Apply cruising controls - occasional thrust
        thrust = 1 if random.random() < 0.1 and current_speed < 2 else 0
        
        if abs(angle_diff) < 5:  # Close enough to desired angle
            rotation = 0
        elif angle_diff > 0:
            rotation = 1
        else:
            rotation = -1
            
        return thrust, rotation