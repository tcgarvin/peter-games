// CRT look for the cabinet screen: the game draws to an ordinary 2D canvas at its own
// resolution, and this pass re-draws it curved, with scanlines, phosphor mask, glow and vignette.

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uSrc;
uniform vec2 uOut;
uniform float uTime;

vec2 warp(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  c *= 1.0 + vec2(c.y * c.y * 0.04, c.x * c.x * 0.055);
  return c * 0.5 + 0.5;
}

void main() {
  vec2 uv = warp(vUv);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec2 px = 1.0 / uSrc;

  // Slight convergence error between the three guns.
  vec3 col = vec3(
    texture2D(uTex, uv + vec2(px.x * 0.7, 0.0)).r,
    texture2D(uTex, uv).g,
    texture2D(uTex, uv - vec2(px.x * 0.7, 0.0)).b);

  vec3 glow = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    glow += texture2D(uTex, uv + vec2(cos(a), sin(a)) * px * 3.5).rgb;
  }
  col += glow / 8.0 * 0.25;

  // Roughly one scanline per three device pixels, never more lines than the game has rows,
  // so small phone screens don't moire.
  float lines = min(uSrc.y, uOut.y / 3.0);
  float scan = 0.5 + 0.5 * cos(uv.y * lines * 6.2831853);
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col *= mix(0.62 + 0.38 * scan, 1.0, clamp(luma * 0.35, 0.0, 0.35));

  if (uOut.x > 480.0) {
    float m = mod(gl_FragCoord.x, 3.0);
    vec3 mask = m < 1.0 ? vec3(1.0, 0.82, 0.82) : m < 2.0 ? vec3(0.82, 1.0, 0.82) : vec3(0.82, 0.82, 1.0);
    col *= mask * 1.1;
  }

  vec2 d = uv * (1.0 - uv);
  col *= pow(clamp(d.x * d.y * 18.0, 0.0, 1.0), 0.22);
  float edge = smoothstep(0.0, 0.008, uv.x) * smoothstep(0.0, 0.008, 1.0 - uv.x)
             * smoothstep(0.0, 0.01, uv.y) * smoothstep(0.0, 0.01, 1.0 - uv.y);
  col *= edge * (0.985 + 0.015 * sin(uTime * 110.0)) * 1.12;

  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`CRT shader failed to compile: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

export class Crt {
  /**
   * @param {HTMLCanvasElement} out the on-page screen canvas
   * @param {HTMLCanvasElement} source the game's 2D canvas
   */
  constructor(out, source) {
    this.out = out;
    this.source = source;
    const gl = out.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) {
      // No WebGL (rare; some locked-down browsers): show the game flat rather than nothing.
      console.warn('WebGL unavailable; drawing the game without the CRT effect.');
      this.flat = out.getContext('2d');
      return;
    }
    this.gl = gl;
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`CRT shader failed to link: ${gl.getProgramInfoLog(program)}`);
    }
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    this.uniforms = {
      src: gl.getUniformLocation(program, 'uSrc'),
      out: gl.getUniformLocation(program, 'uOut'),
      time: gl.getUniformLocation(program, 'uTime'),
    };
  }

  resize(width, height) {
    this.out.width = Math.max(1, Math.round(width));
    this.out.height = Math.max(1, Math.round(height));
  }

  render(time) {
    if (this.flat) {
      this.flat.drawImage(this.source, 0, 0, this.out.width, this.out.height);
      return;
    }
    const gl = this.gl;
    gl.viewport(0, 0, this.out.width, this.out.height);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);
    gl.uniform2f(this.uniforms.src, this.source.width, this.source.height);
    gl.uniform2f(this.uniforms.out, this.out.width, this.out.height);
    gl.uniform1f(this.uniforms.time, time);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
