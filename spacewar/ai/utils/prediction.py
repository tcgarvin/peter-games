"""
Utility functions for collision prediction and threat assessment.
"""
import math
from typing import List, Tuple, Optional

from entities import Ship, Asteroid, SCREEN_WIDTH, SCREEN_HEIGHT

def predict_collision(ship: Ship, 
                     asteroid: Asteroid, 
                     prediction_time: int = 60) -> Tuple[bool, float]:
    """
    Predict if a collision will occur within specified frames.
    
    Args:
        ship: The ship to check
        asteroid: The asteroid to check against
        prediction_time: Number of frames to look ahead
        
    Returns:
        (will_collide, time_to_collision) tuple
    """
    # Predict future positions
    ship_future_x = ship.x + ship.velocity_x * prediction_time
    ship_future_y = ship.y + ship.velocity_y * prediction_time
    
    asteroid_future_x = asteroid.x + asteroid.velocity_x * prediction_time
    asteroid_future_y = asteroid.y + asteroid.velocity_y * prediction_time
    
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
    will_collide = future_distance < (ship.size + asteroid.size + 10)
    
    # Calculate time to collision (approximate)
    if will_collide:
        # Calculate relative velocity
        rel_vel_x = asteroid.velocity_x - ship.velocity_x
        rel_vel_y = asteroid.velocity_y - ship.velocity_y
        rel_velocity = math.sqrt(rel_vel_x**2 + rel_vel_y**2)
        
        # Current distance
        current_distance = ship.get_distance(asteroid)
        
        # Time to collision (frames) - safeguard against division by zero
        time_to_collision = prediction_time if rel_velocity < 0.01 else prediction_time * (
            (current_distance - future_distance) / (current_distance - (ship.size + asteroid.size))
        )
    else:
        time_to_collision = float('inf')
    
    return will_collide, time_to_collision

def find_dangerous_asteroids(ship: Ship, 
                            asteroids: List[Asteroid], 
                            max_distance: float = 150,
                            prediction_time: int = 60) -> List[Tuple[Asteroid, float, float]]:
    """
    Find asteroids that are on collision course with the ship.
    
    Args:
        ship: The ship to check for
        asteroids: List of asteroids to check
        max_distance: Maximum distance to consider asteroids
        prediction_time: Number of frames to look ahead
        
    Returns:
        List of (asteroid, distance, time_to_collision) tuples, sorted by threat level
    """
    dangerous = []
    
    for asteroid in asteroids:
        # Skip if too far away to be an immediate concern
        distance = ship.get_distance(asteroid)
        if distance > max_distance:
            continue
            
        # Predict collision
        will_collide, time_to_collision = predict_collision(ship, asteroid, prediction_time)
        
        if will_collide:
            dangerous.append((asteroid, distance, time_to_collision))
    
    # Sort by time to collision (ascending) - closest threats first
    dangerous.sort(key=lambda x: x[2])
    return dangerous