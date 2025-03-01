"""
AI systems for Spacewar ships.
"""
import random
from typing import List, Optional

from entities import Ship

# Import different AI implementations
from .base import BaseShipAI
from .original import OriginalShipAI
from .delivery import DeliveryFocusedAI
from .cautious import CautiousShipAI

# Available AI implementations
_ai_registry = {
    "original": OriginalShipAI,
    "cautious": CautiousShipAI,
    "delivery": DeliveryFocusedAI,
}

def register_ai(name: str, ai_class: type):
    """Register an AI implementation to make it available for selection."""
    _ai_registry[name] = ai_class

def get_available_ai_types() -> List[str]:
    """Return a list of available AI types."""
    return list(_ai_registry.keys())

def create_ai(ai_type: str, ship: Ship) -> BaseShipAI:
    """
    Factory function to create an AI of the specified type.
    
    Args:
        ai_type: The type of AI to create
        ship: The ship to control
        
    Returns:
        An instance of the requested AI type
    """
    if ai_type not in _ai_registry:
        raise ValueError(f"Unknown AI type: {ai_type}. Available types: {list(_ai_registry.keys())}")
    
    return _ai_registry[ai_type](ship)

def create_random_ai(ship: Ship) -> BaseShipAI:
    """
    Create a random AI from the available types.
    
    Args:
        ship: The ship to control
        
    Returns:
        A randomly selected AI instance
    """
    if not _ai_registry:
        raise ValueError("No AI implementations registered")
    
    ai_type = random.choice(list(_ai_registry.keys()))
    return create_ai(ai_type, ship)