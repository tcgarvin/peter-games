import math
import random
from typing import List, Dict, Any, Optional

class AI:
    def __init__(self, team, regiments, personality=None):
        self.team = team
        self.regiments = regiments
        self.enemy_team = "blue" if team == "red" else "red"
        
        # Set default personality if none provided
        if personality is None:
            self.personality = {
                "optimal_distance_min": 250,
                "optimal_distance_max": 450,
                "alignment_threshold": 10,  # degrees
                "maneuver_threshold": 20,   # degrees
                "random_action_chance": 0.02,
                "aggression": 0.5,          # 0.0 to 1.0 (defensive to aggressive)
                "coordination": 0.5,        # 0.0 to 1.0 (independent to coordinated)
                "caution": 0.5             # 0.0 to 1.0 (reckless to cautious)
            }
        else:
            self.personality = personality
            
    def make_decisions(self, enemy_regiments, bullets):
        actions = []
        for regiment in self.regiments:
            if regiment.destroyed:
                actions.append(None)
                continue
            
            # If in recovery time after firing, must hold position
            if regiment.recovery_time > 0:
                actions.append("hold")
                continue
                
            # Find closest non-destroyed enemy
            closest_enemy = None
            min_distance = float('inf')
            for enemy in enemy_regiments:
                if not enemy.destroyed:
                    dist = math.hypot(regiment.x - enemy.x, regiment.y - enemy.y)
                    if dist < min_distance:
                        min_distance = dist
                        closest_enemy = enemy
            
            if closest_enemy is None:
                # No enemies left, just move forward
                actions.append("move_forward")
                continue
                
            # Calculate angle to enemy
            dx = closest_enemy.x - regiment.x
            dy = closest_enemy.y - regiment.y
            angle_to_enemy = math.atan2(dy, dx)
            
            # Convert current angle to radians for comparison
            current_angle_rad = regiment.angle_rad
            
            # Normalize angles for comparison
            while angle_to_enemy < 0:
                angle_to_enemy += 2 * math.pi
            while current_angle_rad < 0:
                current_angle_rad += 2 * math.pi
                
            # Calculate the difference between angles
            angle_diff = angle_to_enemy - current_angle_rad
            
            # Normalize the difference to be between -pi and pi
            while angle_diff > math.pi:
                angle_diff -= 2 * math.pi
            while angle_diff < -math.pi:
                angle_diff += 2 * math.pi
            
            # Get personality-adjusted parameters
            p = self.personality
            min_range = p["optimal_distance_min"]
            max_range = p["optimal_distance_max"]
            
            # Aggressive units prefer to be closer
            if p["aggression"] > 0.5:
                range_adjustment = (p["aggression"] - 0.5) * 100
                min_range -= range_adjustment
                max_range -= range_adjustment
            # Cautious units prefer to stay further away
            elif p["caution"] > 0.5:
                range_adjustment = (p["caution"] - 0.5) * 100
                min_range += range_adjustment
                max_range += range_adjustment
                
            # Check position relative to optimal
            in_range = min_range <= min_distance <= max_range
            well_aligned = abs(angle_diff) < math.radians(p["alignment_threshold"])
            can_fire = regiment.can_fire()
            
            # First priority: fire if possible in a good position
            if can_fire and well_aligned and in_range:
                action = "fire"
                
            # Second priority: if already started aiming and close to ready, hold position
            elif well_aligned and in_range and regiment.stationary_time > 0:
                action = "hold"  # Continue aiming
                
            # Third priority: get into position
            elif min_distance > max_range:
                # Too far away - need to get closer
                if abs(angle_diff) < math.radians(p["maneuver_threshold"]):
                    action = "move_forward"
                elif angle_diff > 0:
                    action = "wheel_right"
                else:
                    action = "wheel_left"
                
            elif min_distance < min_range:
                # Too close - need to back up
                if abs(angle_diff) < math.radians(p["maneuver_threshold"]):
                    action = "move_backward"
                elif angle_diff > 0:
                    action = "wheel_right"
                else:
                    action = "wheel_left"
                    
            # Fourth priority: align with enemy
            elif abs(angle_diff) > math.radians(p["alignment_threshold"] / 2):
                # Need to rotate to face enemy
                if angle_diff > 0:
                    action = "wheel_right"
                else:
                    action = "wheel_left"
                    
            # Default: if in good range and more or less aligned, hold position to aim
            else:
                action = "hold"
            
            # Apply random actions based on personality
            if random.random() < p["random_action_chance"]:
                action = random.choice(["move_forward", "move_backward", "wheel_left", "wheel_right", "hold"])
                
            actions.append(action)
            
        return actions


class CautiousAI(AI):
    """Prefers to maintain distance and carefully aim shots."""
    def __init__(self, team, regiments):
        personality = {
            "optimal_distance_min": 350,    # Prefers longer range
            "optimal_distance_max": 500,
            "alignment_threshold": 8,      # More precise aiming
            "maneuver_threshold": 15,      # More careful movement
            "random_action_chance": 0.01,  # Less random behavior
            "aggression": 0.2,            # Low aggression
            "coordination": 0.7,          # Good coordination
            "caution": 0.9                # Very cautious
        }
        super().__init__(team, regiments, personality)
        
        # Set AI type for UI display
        for regiment in regiments:
            regiment.ai_type = "Cautious"


class AggressiveAI(AI):
    """Prefers to close distance and fire at close range."""
    def __init__(self, team, regiments):
        personality = {
            "optimal_distance_min": 180,    # Closer combat
            "optimal_distance_max": 350,
            "alignment_threshold": 15,     # Less precise aiming
            "maneuver_threshold": 25,      # More aggressive movement
            "random_action_chance": 0.03,  # More unpredictable
            "aggression": 0.9,            # High aggression
            "coordination": 0.3,          # Less coordination
            "caution": 0.2                # Reckless
        }
        super().__init__(team, regiments, personality)
        
        # Set AI type for UI display
        for regiment in regiments:
            regiment.ai_type = "Aggressive"


class FlankingAI(AI):
    """Tries to move to flanking positions when possible."""
    def __init__(self, team, regiments):
        personality = {
            "optimal_distance_min": 250,
            "optimal_distance_max": 400,
            "alignment_threshold": 12,
            "maneuver_threshold": 18,
            "random_action_chance": 0.02,
            "aggression": 0.6,
            "coordination": 0.5,
            "caution": 0.4
        }
        super().__init__(team, regiments, personality)
        
        # Set AI type for UI display
        for regiment in regiments:
            regiment.ai_type = "Flanking"
        
    def make_decisions(self, enemy_regiments, bullets):
        # Override to prioritize flanking positions
        actions = []
        for regiment in self.regiments:
            if regiment.destroyed:
                actions.append(None)
                continue
                
            if regiment.recovery_time > 0:
                actions.append("hold")
                continue
                
            # Find target and allies
            allies = [r for r in self.regiments if r != regiment and not r.destroyed]
            
            # Base targeting on standard algorithm first
            base_actions = super().make_decisions(enemy_regiments, bullets)
            base_action = base_actions[len(actions)]
            
            # If there's a valid target and allies
            if enemy_regiments and allies:
                # Try to position away from allies to create crossfire
                action = self._calculate_flanking_action(regiment, enemy_regiments, allies)
                if action:
                    actions.append(action)
                    continue
                    
            # Fall back to standard behavior
            actions.append(base_action)
                
        return actions
        
    def _calculate_flanking_action(self, regiment, enemies, allies):
        """Calculate action that positions regiment for flanking"""
        active_enemies = [e for e in enemies if not e.destroyed]
        if not active_enemies:
            return None
            
        # Find primary target (closest enemy)
        target = min(active_enemies, 
                    key=lambda e: math.hypot(regiment.x - e.x, regiment.y - e.y))
        
        # Calculate angle to target
        angle_to_target = math.degrees(math.atan2(
            target.y - regiment.y, 
            target.x - regiment.x
        )) % 360
        
        # Calculate average ally angle to same target
        ally_angles = []
        for ally in allies:
            if not ally.destroyed:
                ally_angle = math.degrees(math.atan2(
                    target.y - ally.y,
                    target.x - ally.x
                )) % 360
                ally_angles.append(ally_angle)
                
        if not ally_angles:
            return None
            
        avg_ally_angle = sum(ally_angles) / len(ally_angles)
        
        # Try to position roughly 90 degrees from allies when possible
        angle_diff = (angle_to_target - avg_ally_angle) % 360
        
        if abs(angle_diff) < 30 or abs(angle_diff - 360) < 30:
            # Too close to allies, try to move to flank
            # Determine which way to go (left or right of current position)
            if angle_diff < 180:
                return "wheel_left"  # Move to get a different angle
            else:
                return "wheel_right"
                
        return None