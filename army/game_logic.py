import pygame
import math
import random
import time
from entities import Regiment, Bullet, MAX_BULLETS, BULLET_DAMAGE
from typing import List, Dict, Tuple, Optional

def handle_events(events):
    """Process pygame events and return game control flags
    
    Args:
        events: List of pygame events to process
        
    Returns:
        Tuple of (quit_requested, toggle_debug, speed_change, restart_game)
    """
    quit_requested = False
    toggle_debug = False
    speed_change = None
    restart_game = False
    
    for event in events:
        if event.type == pygame.QUIT:
            quit_requested = True
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_ESCAPE or event.key == pygame.K_q:
                quit_requested = True
            elif event.key == pygame.K_SPACE:
                restart_game = True
            elif event.key == pygame.K_d:
                toggle_debug = True
            elif event.key == pygame.K_1:
                speed_change = 1
            elif event.key == pygame.K_2:
                speed_change = 2
            elif event.key == pygame.K_3:
                speed_change = 3
                
    return (quit_requested, toggle_debug, speed_change, restart_game)


def update_regiments(regiments, actions, enemy_regiments, bullets, team):
    """Update regiments based on AI actions and handle firing
    
    Args:
        regiments: List of regiments to update
        actions: List of actions for each regiment
        enemy_regiments: List of enemy regiments (for targeting)
        bullets: Current list of bullets
        team: Team color ("red" or "blue")
        
    Returns:
        Tuple of (updated bullets list, number of new bullets fired)
    """
    new_bullets_count = 0
    
    for i, regiment in enumerate(regiments):
        action = actions[i]
        regiment.update(action)
        
        if action == "fire" and len(bullets) < MAX_BULLETS:
            regiment_bullets = regiment.fire()
            if regiment_bullets:
                bullets.extend(regiment_bullets)
                new_bullets_count += len(regiment_bullets)
                
    return bullets, new_bullets_count


def update_bullets(bullets, red_regiments, blue_regiments, battlefield_margin, screen_width, screen_height):
    """Update bullet positions and handle collisions
    
    Args:
        bullets: List of bullets to update
        red_regiments: List of red regiments for collision detection
        blue_regiments: List of blue regiments for collision detection
        battlefield_margin: Margin around the battlefield
        screen_width: Width of the screen
        screen_height: Height of the screen
        
    Returns:
        Tuple of (updated bullets list, red damage, blue damage)
    """
    red_damage = 0
    blue_damage = 0
    i = 0
    
    while i < len(bullets):
        bullet = bullets[i]
        bullet.update()
        
        # Check for collisions with regiments
        hit = False
        
        if bullet.team == "red":
            # Red bullet can hit blue regiments
            for regiment in blue_regiments:
                if not regiment.destroyed and regiment.is_colliding(bullet):
                    regiment.take_damage(BULLET_DAMAGE)
                    red_damage += BULLET_DAMAGE
                    hit = True
                    break
        else:
            # Blue bullet can hit red regiments
            for regiment in red_regiments:
                if not regiment.destroyed and regiment.is_colliding(bullet):
                    regiment.take_damage(BULLET_DAMAGE)
                    blue_damage += BULLET_DAMAGE
                    hit = True
                    break
        
        # Remove the bullet if it hit something or expired
        if hit or bullet.is_expired(battlefield_margin, screen_width, screen_height):
            bullets.pop(i)
        else:
            i += 1
            
    return bullets, red_damage, blue_damage


def check_win_condition(red_regiments, blue_regiments):
    """Check if either team has won
    
    Args:
        red_regiments: List of red regiments
        blue_regiments: List of blue regiments
        
    Returns:
        Tuple of (game_over, winner)
    """
    red_alive = sum(1 for r in red_regiments if not r.destroyed)
    blue_alive = sum(1 for r in blue_regiments if not r.destroyed)
    
    if red_alive == 0:
        return True, "blue"
    elif blue_alive == 0:
        return True, "red"
    else:
        return False, None


def calculate_fps(fps_count, fps_update_time):
    """Calculate current FPS
    
    Args:
        fps_count: Current frame count since last update
        fps_update_time: Time of last FPS update
        
    Returns:
        Tuple of (new_fps_display, new_fps_count, new_fps_update_time)
    """
    current_time = time.time()
    if current_time - fps_update_time > 0.5:  # Update FPS every half second
        fps_display = fps_count / (current_time - fps_update_time)
        return fps_display, 0, current_time
    else:
        return None, fps_count + 1, fps_update_time


def cap_framerate(frame_start_time, game_speed):
    """Cap the frame rate based on game speed
    
    Args:
        frame_start_time: Time when frame processing started
        game_speed: Current game speed multiplier
    """
    target_frame_time = 1.0 / (60 * game_speed)
    elapsed = time.time() - frame_start_time
    if elapsed < target_frame_time:
        delay = target_frame_time - elapsed
        time.sleep(delay)