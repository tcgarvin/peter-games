"""
Base class and interfaces for ship AI implementations.
"""
from abc import ABC, abstractmethod
from typing import List, Tuple, Optional

from entities import Ship, Asteroid, DeliveryZone

class BaseShipAI(ABC):
    """Base class for all ship AI implementations."""
    
    def __init__(self, ship: Ship):
        self.ship = ship
        self.current_mode = "initialize"  # For UI display
    
    @abstractmethod
    def make_decision(self, 
                     asteroids: List[Asteroid], 
                     other_ships: List[Ship], 
                     delivery_zones: Optional[List[DeliveryZone]] = None) -> Tuple[int, int]:
        """
        Make a decision for ship controls based on environment.
        Returns: (thrust, rotation)
        """
        pass
    
    def get_name(self) -> str:
        """Return the name of this AI implementation."""
        return self.__class__.__name__
        
    def get_description(self) -> str:
        """Return a human-readable description of this AI."""
        return "Generic Ship AI"