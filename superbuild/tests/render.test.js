// render.test.js — Renderer tests with Three.js mocked.
//
// Three.js WebGLRenderer requires a real GPU context which is unavailable in
// jsdom.  We mock the heavy WebGL surface while keeping the canvas-based
// texture-building methods testable in isolation.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Track, WAYPOINTS, WORLD_W, WORLD_H, TRACK_HALF_WIDTH } from '../track.js';

// ---- Three.js mock ----
// We mock only the symbols render.js actually imports.

vi.mock('three', () => {
  class FakeGeometry {
    rotateX() { return this; }
    dispose()  {}
  }
  class FakeMaterial {
    dispose() {}
  }
  class FakeMesh {
    constructor() {
      this.position  = { set: vi.fn() };
      this.rotation  = { y: 0 };
      this.geometry  = new FakeGeometry();
      this.material  = new FakeMaterial();
    }
  }
  class FakeRenderer {
    constructor()              { this.domElement = document.createElement('canvas'); }
    setPixelRatio()            {}
    setSize()                  {}
    render()                   {}
    dispose()                  {}
  }
  class FakeCamera {
    constructor()              { this.aspect = 1; }
    updateProjectionMatrix()   {}
    position = { set: vi.fn() };
    lookAt    = vi.fn();
  }
  class FakeScene {
    background = null;
    fog        = null;
    add        = vi.fn();
    remove     = vi.fn();
  }
  class FakeFog {}
  class FakeColor {}
  class FakeCanvasTexture {
    constructor(canvas)        { this.image = canvas; this.flipY = true; this.needsUpdate = false; }
  }
  return {
    WebGLRenderer:   FakeRenderer,
    PerspectiveCamera: FakeCamera,
    Scene:           FakeScene,
    PlaneGeometry:   FakeGeometry,
    MeshBasicMaterial: FakeMaterial,
    Mesh:            FakeMesh,
    Fog:             FakeFog,
    Color:           FakeColor,
    CanvasTexture:   FakeCanvasTexture,
  };
});

import { Renderer } from '../render.js';

// ---- Test helpers ----

function makeContainer() {
  const div = document.createElement('div');
  div.style.width  = '800px';
  div.style.height = '600px';
  Object.defineProperty(div, 'clientWidth',  { value: 800 });
  Object.defineProperty(div, 'clientHeight', { value: 600 });
  // Minimap canvas expected by Renderer
  const mini = document.createElement('canvas');
  mini.id = 'minimap';
  mini.width  = 140;
  mini.height = 100;
  div.appendChild(mini);
  document.body.appendChild(div);
  return div;
}

function makeSimStub(cars = []) {
  return {
    localCar: cars.find(c => c.isLocal) ?? null,
    cars,
  };
}

function makeCar(overrides = {}) {
  return {
    id: 'test', isLocal: true,
    x: 0, z: 0, angle: 0, speed: 0,
    ...overrides,
  };
}

// ---- Constructor ----

describe('Renderer constructor', () => {
  let container, renderer;

  beforeEach(() => { container = makeContainer(); });
  afterEach(() => {
    renderer?.dispose();
    document.body.removeChild(container);
  });

  it('does not throw', () => {
    expect(() => {
      renderer = new Renderer(container, new Track());
    }).not.toThrow();
  });

  it('inserts a canvas element into the container', () => {
    renderer = new Renderer(container, new Track());
    const canvases = container.querySelectorAll('canvas');
    expect(canvases.length).toBeGreaterThanOrEqual(1);
  });
});

// ---- render() ----

describe('Renderer.render', () => {
  let container, renderer;

  beforeEach(() => {
    container = makeContainer();
    renderer  = new Renderer(container, new Track());
  });
  afterEach(() => {
    renderer.dispose();
    document.body.removeChild(container);
  });

  it('does not throw with a local car', () => {
    const sim = makeSimStub([makeCar({ isLocal: true })]);
    expect(() => renderer.render(sim, 0)).not.toThrow();
  });

  it('does not throw with no cars', () => {
    const sim = makeSimStub([]);
    expect(() => renderer.render(sim, 0)).not.toThrow();
  });

  it('does not throw with multiple cars', () => {
    const sim = makeSimStub([
      makeCar({ id: 'a', isLocal: true }),
      makeCar({ id: 'b', isLocal: false }),
    ]);
    expect(() => renderer.render(sim, 0)).not.toThrow();
  });

  it('handles a car with a large angle without throwing', () => {
    const sim = makeSimStub([makeCar({ angle: 7 * Math.PI })]);
    expect(() => renderer.render(sim, 0)).not.toThrow();
  });

  it('calling render multiple times does not throw', () => {
    const sim = makeSimStub([makeCar()]);
    for (let i = 0; i < 5; i++) {
      expect(() => renderer.render(sim, i / 5)).not.toThrow();
    }
  });
});

// ---- resize ----

describe('Renderer.resize', () => {
  let container, renderer;

  beforeEach(() => {
    container = makeContainer();
    renderer  = new Renderer(container, new Track());
  });
  afterEach(() => {
    renderer.dispose();
    document.body.removeChild(container);
  });

  it('does not throw on resize', () => {
    expect(() => renderer.resize(1920, 1080)).not.toThrow();
  });
});

// ---- dispose ----

describe('Renderer.dispose', () => {
  it('does not throw on dispose', () => {
    const container = makeContainer();
    const renderer  = new Renderer(container, new Track());
    expect(() => renderer.dispose()).not.toThrow();
    document.body.removeChild(container);
  });
});

// ---- Car mesh lifecycle ----

describe('Renderer car mesh management', () => {
  let container, renderer;

  beforeEach(() => {
    container = makeContainer();
    renderer  = new Renderer(container, new Track());
  });
  afterEach(() => {
    renderer.dispose();
    document.body.removeChild(container);
  });

  it('creates a mesh for a new car on first render', () => {
    const sim = makeSimStub([makeCar({ id: 'p1' })]);
    renderer.render(sim, 0);
    expect(renderer._carMeshes.has('p1')).toBe(true);
  });

  it('reuses the same mesh on subsequent renders for the same car', () => {
    const sim = makeSimStub([makeCar({ id: 'p1' })]);
    renderer.render(sim, 0);
    const mesh1 = renderer._carMeshes.get('p1');
    renderer.render(sim, 0);
    const mesh2 = renderer._carMeshes.get('p1');
    expect(mesh1).toBe(mesh2);
  });

  it('removes the mesh when the car disappears from the sim', () => {
    const car = makeCar({ id: 'p1' });
    renderer.render(makeSimStub([car]), 0);
    expect(renderer._carMeshes.has('p1')).toBe(true);

    renderer.render(makeSimStub([]), 0); // car gone
    expect(renderer._carMeshes.has('p1')).toBe(false);
  });

  it('creates distinct meshes for different cars', () => {
    const sim = makeSimStub([
      makeCar({ id: 'a', isLocal: true }),
      makeCar({ id: 'b', isLocal: false }),
    ]);
    renderer.render(sim, 0);
    expect(renderer._carMeshes.has('a')).toBe(true);
    expect(renderer._carMeshes.has('b')).toBe(true);
    expect(renderer._carMeshes.get('a')).not.toBe(renderer._carMeshes.get('b'));
  });
});

// ---- Track texture geometry ----

describe('Track texture (canvas-based generation)', () => {
  it('_buildTrackTexture returns an object with a canvas image', () => {
    const container = makeContainer();
    const renderer  = new Renderer(container, new Track());
    const tex = renderer._buildTrackTexture();
    expect(tex).toBeDefined();
    expect(tex.image).toBeInstanceOf(HTMLCanvasElement);
    renderer.dispose();
    document.body.removeChild(container);
  });

  it('texture canvas has the correct dimensions (2048×2048)', () => {
    const container = makeContainer();
    const renderer  = new Renderer(container, new Track());
    const tex = renderer._buildTrackTexture();
    expect(tex.image.width).toBe(2048);
    expect(tex.image.height).toBe(2048);
    renderer.dispose();
    document.body.removeChild(container);
  });

  it('texture flipY is false (UV convention)', () => {
    const container = makeContainer();
    const renderer  = new Renderer(container, new Track());
    const tex = renderer._buildTrackTexture();
    expect(tex.flipY).toBe(false);
    renderer.dispose();
    document.body.removeChild(container);
  });

  it('_buildCarTexture returns a canvas-backed texture', () => {
    const container = makeContainer();
    const renderer  = new Renderer(container, new Track());
    const tex = renderer._buildCarTexture('#ff0000');
    expect(tex).toBeDefined();
    expect(tex.image).toBeInstanceOf(HTMLCanvasElement);
    renderer.dispose();
    document.body.removeChild(container);
  });

  it('car texture canvas is 128×128', () => {
    const container = makeContainer();
    const renderer  = new Renderer(container, new Track());
    const tex = renderer._buildCarTexture('#0000ff');
    expect(tex.image.width).toBe(128);
    expect(tex.image.height).toBe(128);
    renderer.dispose();
    document.body.removeChild(container);
  });

  it('car texture has default flipY=true', () => {
    const container = makeContainer();
    const renderer  = new Renderer(container, new Track());
    const tex = renderer._buildCarTexture('#00ff00');
    // CanvasTexture defaults to flipY=true; we rely on that for correct UV.
    expect(tex.flipY).toBe(true);
    renderer.dispose();
    document.body.removeChild(container);
  });
});

// ---- Camera update (indirect via spy) ----

describe('Renderer camera update', () => {
  let container, renderer;

  beforeEach(() => {
    container = makeContainer();
    renderer  = new Renderer(container, new Track());
  });
  afterEach(() => {
    renderer.dispose();
    document.body.removeChild(container);
  });

  it('camera.position.set is called once per render with a local car', () => {
    const sim = makeSimStub([makeCar({ isLocal: true })]);
    renderer.render(sim, 0);
    expect(renderer._camera.position.set).toHaveBeenCalledTimes(1);
  });

  it('camera.lookAt is called once per render with a local car', () => {
    const sim = makeSimStub([makeCar({ isLocal: true })]);
    renderer.render(sim, 0);
    expect(renderer._camera.lookAt).toHaveBeenCalledTimes(1);
  });

  it('camera is not repositioned when there is no local car', () => {
    const sim = makeSimStub([makeCar({ id: 'remote', isLocal: false })]);
    renderer.render(sim, 0);
    expect(renderer._camera.position.set).not.toHaveBeenCalled();
  });
});
