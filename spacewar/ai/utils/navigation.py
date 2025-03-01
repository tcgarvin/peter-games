"""
Utility functions for navigation, movement, and steering behaviors.
"""
import math
from typing import Tuple, List, Optional

from entities import Ship, Entity, MAX_PICKUP_VELOCITY

def get_angle_to_target(ship: Ship, target_x: float, target_y: float) -> float:
    """
    Calculate the angle (in degrees) from ship to target position.
    
    Args:
        ship: The ship object
        target_x: Target x coordinate
        target_y: Target y coordinate
        
    Returns:
        Angle in degrees (0-360)
    """
    angle_rad = math.atan2(target_y - ship.y, target_x - ship.x)
    angle_deg = math.degrees(angle_rad) % 360
    return angle_deg

def get_steering_direction(current_angle: float, target_angle: float) -> int:
    """
    Determine steering direction to reach target angle.
    
    Args:
        current_angle: Current ship angle (degrees)
        target_angle: Target angle (degrees)
        
    Returns:
        -1 (counter-clockwise), 0 (on target), or 1 (clockwise)
    """
    angle_diff = (target_angle - current_angle + 180) % 360 - 180
    
    if abs(angle_diff) < 5:  # Close enough to desired angle
        return 0
    elif angle_diff > 0:
        return 1  # Clockwise
    else:
        return -1  # Counter-clockwise

def calculate_approach_vector(ship: Ship, 
                             target_x: float, 
                             target_y: float, 
                             desired_speed: float = MAX_PICKUP_VELOCITY) -> Tuple[float, float]:
    """
    Calculate a vector to approach a target at the desired speed.
    
    Args:
        ship: The ship object
        target_x: Target x coordinate
        target_y: Target y coordinate
        desired_speed: The desired approach speed
        
    Returns:
        (target_angle, thrust) tuple
    """
    # Current vector
    current_speed = math.sqrt(ship.velocity_x**2 + ship.velocity_y**2)
    
    # Direction to target
    angle_to_target = get_angle_to_target(ship, target_x, target_y)
    
    # Distance to target
    dx = min(abs(ship.x - target_x), 360 - abs(ship.x - target_x))
    dy = min(abs(ship.y - target_y), 360 - abs(ship.y - target_y))
    distance = math.sqrt(dx**2 + dy**2)
    
    # Determine thrust based on current speed and distance
    if current_speed > desired_speed * 1.2:
        # We're going too fast - need to slow down
        # Determine braking thrust direction (opposite to movement)
        movement_angle = math.degrees(math.atan2(ship.velocity_y, ship.velocity_x)) % 360
        braking_angle = (movement_angle + 180) % 360
        
        # Brake if we're pointing in an appropriate direction for braking
        angle_diff = abs((braking_angle - ship.angle + 180) % 360 - 180)
        if angle_diff < 30:
            return ship.angle, 1  # Use current angle and thrust to brake
        else:
            return braking_angle, 0  # Rotate toward braking angle
    elif distance < 50 and current_speed > desired_speed:
        # Close to target, slow down
        return angle_to_target, 0
    else:
        # Normal approach
        return angle_to_target, 1 if current_speed < desired_speed else 0

def estimate_braking_distance(ship: Ship, desired_speed: float = 0.0) -> float:
    """
    Estimate the distance needed to slow down to the desired speed.
    
    Args:
        ship: The ship object
        desired_speed: Target speed
        
    Returns:
        Estimated distance in pixels
    """
    from entities import SHIP_DRAG
    
    current_speed = math.sqrt(ship.velocity_x**2 + ship.velocity_y**2)
    
    # If already slower than desired, no braking needed
    if current_speed <= desired_speed:
        return 0
    
    # Simple physics model: v = v0 * (1-drag)^t
    # Solve for t: t = ln(v/v0) / ln(1-drag)
    # Then distance ≈ v0 * (1-(1-drag)^t) / drag
    
    if desired_speed <= 0.01:  # Effectively zero
        # Approximate distance to full stop
        return current_speed / SHIP_DRAG
    else:
        # Frames to reach desired speed
        frames = math.log(desired_speed / current_speed) / math.log(1 - SHIP_DRAG)
        
        # Approximate distance travelled while decelerating
        return current_speed * (1 - (1 - SHIP_DRAG) ** frames) / SHIP_DRAG