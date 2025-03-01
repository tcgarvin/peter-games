"""
Utility functions for AI decision making and state management.
"""
import math
import random
from typing import List, Tuple, Dict, Any, Optional

from entities import Ship, Asteroid, DeliveryZone

def find_closest_entity(ship: Ship, entities: List[Any]) -> Tuple[Any, float]:
    """
    Find the closest entity to the ship.
    
    Args:
        ship: The ship object
        entities: List of entities to check
        
    Returns:
        (closest_entity, distance) tuple or (None, float('inf')) if list is empty
    """
    if not entities:
        return None, float('inf')
        
    closest = min(entities, key=lambda e: ship.get_distance(e))
    distance = ship.get_distance(closest)
    
    return closest, distance

def find_closest_zone_by_type(ship: Ship, 
                             zones: List[DeliveryZone], 
                             zone_type: str) -> Tuple[Optional[DeliveryZone], float]:
    """
    Find the closest zone of a specific type.
    
    Args:
        ship: The ship object
        zones: List of delivery zones
        zone_type: Type of zone to find ('pickup' or 'dropoff')
        
    Returns:
        (closest_zone, distance) tuple or (None, float('inf')) if none found
    """
    matching_zones = [z for z in zones if z.zone_type == zone_type]
    return find_closest_entity(ship, matching_zones)

def should_pursue_delivery(ship: Ship, 
                          asteroids: List[Asteroid],
                          zones: List[DeliveryZone]) -> bool:
    """
    Decide if the ship should pursue delivery tasks based on safety.
    
    Args:
        ship: The ship object
        asteroids: List of asteroids in the game
        zones: List of delivery zones
        
    Returns:
        True if ship should pursue delivery, False if it should focus on survival
    """
    # Don't pursue delivery if no zones exist
    if not zones:
        return False
    
    # Check for nearby asteroids
    close_asteroids = []
    for asteroid in asteroids:
        distance = ship.get_distance(asteroid)
        if distance < 100:  # Consider asteroids within 100 pixels
            close_asteroids.append((asteroid, distance))
    
    # If too many nearby asteroids, focus on survival
    if len(close_asteroids) > 3:
        return False
    
    # If any very close asteroids, focus on survival
    if any(distance < 50 for _, distance in close_asteroids):
        return False
        
    # Otherwise, safe to pursue delivery
    return True