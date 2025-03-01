"""
Procedural maze generation for Orcs Must Die 2D.
"""
import random
import math
from config import *

class MazeGenerator:
    def __init__(self):
        # Calculate grid cell size based on orc size
        self.base_unit = ENEMY_TYPES["basic"]["radius"] * 2  # Orc diameter as grid unit
        self.corridor_width = self.base_unit * 3  # Corridors are 3 orcs wide
        
        # Calculate grid dimensions
        self.grid_width = SCREEN_WIDTH // self.base_unit
        self.grid_height = SCREEN_HEIGHT // self.base_unit
        
        # Center coordinates
        self.center_x = SCREEN_WIDTH // 2
        self.center_y = SCREEN_HEIGHT // 2
        
        # Clear area around objective
        self.center_clear_radius = OBJECTIVE_RADIUS + self.corridor_width
    
    def generate_maze(self):
        """Generate a maze with entrances and paths to the center"""
        obstacles = []
        wall_thickness = self.base_unit
        
        # We'll use a grid-based approach
        grid = self.initialize_grid()
        
        # Create entrances
        entrances = self.create_entrances(grid)
        
        # Generate paths from entrances to center
        self.create_paths_to_center(grid, entrances)
        
        # Add some random connecting paths for more interest
        self.add_random_connections(grid)
        
        # Convert grid to actual obstacle coordinates
        obstacles = self.grid_to_obstacles(grid)
        
        return obstacles, entrances
    
    def initialize_grid(self):
        """Initialize the grid with walls everywhere"""
        grid = [[1 for _ in range(self.grid_width)] for _ in range(self.grid_height)]
        
        # Clear center area
        center_grid_x = self.grid_width // 2
        center_grid_y = self.grid_height // 2
        center_grid_radius = int(self.center_clear_radius / self.base_unit)
        
        for y in range(self.grid_height):
            for x in range(self.grid_width):
                distance = math.sqrt((x - center_grid_x)**2 + (y - center_grid_y)**2)
                if distance < center_grid_radius:
                    grid[y][x] = 0  # Clear cells near center
        
        return grid
    
    def create_entrances(self, grid):
        """Create random entrances on each side of the maze"""
        entrances = []
        
        # For each side, create one entrance
        # North side
        north_x = random.randint(5, self.grid_width - 6)
        for i in range(3):  # Make entrance 3 units wide
            grid[0][north_x + i] = 0
        entrances.append((north_x * self.base_unit + self.base_unit, 0))
        
        # East side
        east_y = random.randint(5, self.grid_height - 6)
        for i in range(3):
            grid[east_y + i][self.grid_width - 1] = 0
        entrances.append((SCREEN_WIDTH, east_y * self.base_unit + self.base_unit))
        
        # South side
        south_x = random.randint(5, self.grid_width - 6)
        for i in range(3):
            grid[self.grid_height - 1][south_x + i] = 0
        entrances.append((south_x * self.base_unit + self.base_unit, SCREEN_HEIGHT))
        
        # West side
        west_y = random.randint(5, self.grid_height - 6)
        for i in range(3):
            grid[west_y + i][0] = 0
        entrances.append((0, west_y * self.base_unit + self.base_unit))
        
        return entrances
    
    def create_paths_to_center(self, grid, entrances):
        """Create paths from entrances to center using a simple algorithm"""
        center_grid_x = self.grid_width // 2
        center_grid_y = self.grid_height // 2
        
        for entrance_x, entrance_y in entrances:
            # Convert to grid coordinates
            start_grid_x = min(self.grid_width - 1, max(0, int(entrance_x / self.base_unit)))
            start_grid_y = min(self.grid_height - 1, max(0, int(entrance_y / self.base_unit)))
            
            # Carve path to center using a modified drunk walk
            current_x, current_y = start_grid_x, start_grid_y
            
            # Calculate direction to center
            to_center_x = center_grid_x - current_x
            to_center_y = center_grid_y - current_y
            
            # Create corridor
            while not (abs(current_x - center_grid_x) < 5 and abs(current_y - center_grid_y) < 5):
                # Determine primary direction
                if abs(to_center_x) > abs(to_center_y):
                    # Move horizontally
                    step_x = 1 if to_center_x > 0 else -1
                    step_y = 0
                else:
                    # Move vertically
                    step_x = 0
                    step_y = 1 if to_center_y > 0 else -1
                
                # Occasionally change direction randomly
                if random.random() < 0.3:
                    if random.random() < 0.5:
                        step_x = 0 if step_x != 0 else random.choice([-1, 1])
                        step_y = 0 if step_y != 0 else random.choice([-1, 1])
                
                # Move in chosen direction for a few steps
                steps = random.randint(3, 6)
                for _ in range(steps):
                    # Ensure we don't go off grid
                    next_x = max(0, min(self.grid_width - 1, current_x + step_x))
                    next_y = max(0, min(self.grid_height - 1, current_y + step_y))
                    
                    # Carve a corridor (make it 3 cells wide)
                    self.carve_corridor(grid, current_x, current_y, next_x, next_y)
                    
                    current_x, current_y = next_x, next_y
                    
                    # Update direction to center
                    to_center_x = center_grid_x - current_x
                    to_center_y = center_grid_y - current_y
                    
                    # If we're close to center, stop
                    if abs(current_x - center_grid_x) < 5 and abs(current_y - center_grid_y) < 5:
                        break
    
    def carve_corridor(self, grid, x1, y1, x2, y2):
        """Carve a corridor between two points, making it 3 cells wide"""
        # Get direction
        dx = 1 if x2 > x1 else (-1 if x2 < x1 else 0)
        dy = 1 if y2 > y1 else (-1 if y2 < y1 else 0)
        
        # Distance
        distance = max(abs(x2 - x1), abs(y2 - y1))
        
        # For each step along the path
        for i in range(distance + 1):
            # Current position
            x = x1 + i * dx
            y = y1 + i * dy
            
            # Carve a 3x3 corridor around current position
            for cy in range(-1, 2):
                for cx in range(-1, 2):
                    nx, ny = x + cx, y + cy
                    if 0 <= nx < self.grid_width and 0 <= ny < self.grid_height:
                        grid[ny][nx] = 0
    
    def add_random_connections(self, grid):
        """Add some random connections to make the maze more interesting"""
        # For a certain number of attempts
        for _ in range(10):
            # Pick a random point in the grid
            x = random.randint(5, self.grid_width - 6)
            y = random.randint(5, self.grid_height - 6)
            
            # If it's a wall
            if grid[y][x] == 1:
                # Check if connecting two open areas
                open_neighbors = 0
                for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < self.grid_width and 0 <= ny < self.grid_height:
                        if grid[ny][nx] == 0:
                            open_neighbors += 1
                
                # If it's connecting two open areas
                if open_neighbors >= 2:
                    # Create a new passage
                    for cy in range(-1, 2):
                        for cx in range(-1, 2):
                            nx, ny = x + cx, y + cy
                            if 0 <= nx < self.grid_width and 0 <= ny < self.grid_height:
                                grid[ny][nx] = 0
    
    def grid_to_obstacles(self, grid):
        """Convert grid to actual obstacle coordinates"""
        obstacles = []
        
        # Group adjacent wall cells into larger rectangles
        visited = set()
        
        for y in range(self.grid_height):
            for x in range(self.grid_width):
                if grid[y][x] == 1 and (x, y) not in visited:
                    # Found a wall cell, try to expand to a rectangle
                    width = 1
                    height = 1
                    
                    # Expand width
                    while x + width < self.grid_width and grid[y][x + width] == 1:
                        width += 1
                    
                    # Expand height
                    can_expand = True
                    while can_expand and y + height < self.grid_height:
                        for nx in range(x, x + width):
                            if grid[y + height][nx] != 1:
                                can_expand = False
                                break
                        if can_expand:
                            height += 1
                    
                    # Mark cells as visited
                    for ny in range(y, y + height):
                        for nx in range(x, x + width):
                            visited.add((nx, ny))
                    
                    # Add obstacle
                    obstacles.append((
                        x * self.base_unit,
                        y * self.base_unit,
                        width * self.base_unit,
                        height * self.base_unit
                    ))
        
        return obstacles