//! Minimal instanced WebGL2 renderer: one box mesh, per-instance position + quaternion,
//! Lambert shading. Matches the Three.js and Godot setups: same camera, light, colours, no shadows.
use wasm_bindgen::{JsCast, JsValue};
use web_sys::{HtmlCanvasElement, WebGl2RenderingContext as GL, WebGlBuffer, WebGlProgram, WebGlUniformLocation};

const VS: &str = r#"#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_nrm;
layout(location=2) in vec3 i_pos;
layout(location=3) in vec4 i_rot;
uniform mat4 u_vp;
uniform vec3 u_scale;
out vec3 v_nrm;
vec3 rot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
void main() {
  v_nrm = rot(i_rot, a_nrm);
  gl_Position = u_vp * vec4(i_pos + rot(i_rot, a_pos * u_scale), 1.0);
}"#;

const FS: &str = r#"#version 300 es
precision mediump float;
in vec3 v_nrm;
uniform vec3 u_color;
uniform vec3 u_light;
out vec4 o;
void main() { o = vec4(u_color * (0.35 + 0.65 * max(dot(normalize(v_nrm), u_light), 0.0)), 1.0); }"#;

pub struct Renderer {
    gl: GL,
    inst: WebGlBuffer,
    floor: WebGlBuffer,
    u_scale: WebGlUniformLocation,
    u_color: WebGlUniformLocation,
}

impl Renderer {
    pub fn new(canvas: &HtmlCanvasElement, max_bodies: usize) -> Result<Self, JsValue> {
        let gl: GL = canvas.get_context("webgl2")?.ok_or("no webgl2")?.dyn_into()?;
        let prog = program(&gl)?;
        gl.use_program(Some(&prog));
        let vao = gl.create_vertex_array();
        gl.bind_vertex_array(vao.as_ref());

        let mesh = gl.create_buffer();
        gl.bind_buffer(GL::ARRAY_BUFFER, mesh.as_ref());
        unsafe { gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &js_sys::Float32Array::view(&cube()), GL::STATIC_DRAW) };
        gl.enable_vertex_attrib_array(0);
        gl.vertex_attrib_pointer_with_i32(0, 3, GL::FLOAT, false, 24, 0);
        gl.enable_vertex_attrib_array(1);
        gl.vertex_attrib_pointer_with_i32(1, 3, GL::FLOAT, false, 24, 12);

        let inst = gl.create_buffer().ok_or("buffer")?;
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&inst));
        gl.buffer_data_with_i32(GL::ARRAY_BUFFER, (max_bodies * 28) as i32, GL::DYNAMIC_DRAW);
        let floor = gl.create_buffer().ok_or("buffer")?;
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&floor));
        unsafe { gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &js_sys::Float32Array::view(&[0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 1.0]), GL::STATIC_DRAW) };
        gl.vertex_attrib_divisor(2, 1);
        gl.vertex_attrib_divisor(3, 1);
        gl.enable_vertex_attrib_array(2);
        gl.enable_vertex_attrib_array(3);

        let loc = |n| gl.get_uniform_location(&prog, n).ok_or(JsValue::from_str(n));
        let (w, h) = (canvas.width() as f32, canvas.height() as f32);
        let proj = glam::Mat4::perspective_rh_gl(60f32.to_radians(), w / h, 0.2, 2000.0);
        let view = glam::Mat4::look_at_rh(glam::vec3(0.0, 16.0, 42.0), glam::vec3(0.0, 8.0, 0.0), glam::Vec3::Y);
        gl.uniform_matrix4fv_with_f32_array(Some(&loc("u_vp")?), false, &(proj * view).to_cols_array());
        let l = glam::vec3(0.4, 0.85, 0.35).normalize();
        gl.uniform3f(Some(&loc("u_light")?), l.x, l.y, l.z);
        gl.viewport(0, 0, w as i32, h as i32);
        gl.enable(GL::DEPTH_TEST);
        gl.clear_color(0.043, 0.055, 0.078, 1.0);
        Ok(Renderer { u_scale: loc("u_scale")?, u_color: loc("u_color")?, gl, inst, floor })
    }

    pub fn draw(&mut self, inst: &[f32], count: usize) {
        let gl = &self.gl;
        gl.clear(GL::COLOR_BUFFER_BIT | GL::DEPTH_BUFFER_BIT);
        self.bind(&self.floor);
        gl.uniform3f(Some(&self.u_scale), 30.0, 1.0, 30.0);
        gl.uniform3f(Some(&self.u_color), 0.16, 0.18, 0.22);
        gl.draw_arrays_instanced(GL::TRIANGLES, 0, 36, 1);
        if count > 0 {
            self.bind(&self.inst);
            unsafe { gl.buffer_sub_data_with_i32_and_array_buffer_view(GL::ARRAY_BUFFER, 0, &js_sys::Float32Array::view(inst)) };
            gl.uniform3f(Some(&self.u_scale), crate::HALF, crate::HALF, crate::HALF);
            gl.uniform3f(Some(&self.u_color), 0.78, 0.83, 0.9);
            gl.draw_arrays_instanced(GL::TRIANGLES, 0, 36, count as i32);
        }
    }

    fn bind(&self, buf: &WebGlBuffer) {
        self.gl.bind_buffer(GL::ARRAY_BUFFER, Some(buf));
        self.gl.vertex_attrib_pointer_with_i32(2, 3, GL::FLOAT, false, 28, 0);
        self.gl.vertex_attrib_pointer_with_i32(3, 4, GL::FLOAT, false, 28, 12);
    }
}

fn program(gl: &GL) -> Result<WebGlProgram, JsValue> {
    let prog = gl.create_program().ok_or("program")?;
    for (kind, src) in [(GL::VERTEX_SHADER, VS), (GL::FRAGMENT_SHADER, FS)] {
        let s = gl.create_shader(kind).ok_or("shader")?;
        gl.shader_source(&s, src);
        gl.compile_shader(&s);
        if !gl.get_shader_parameter(&s, GL::COMPILE_STATUS).as_bool().unwrap_or(false) {
            return Err(gl.get_shader_info_log(&s).unwrap_or_default().into());
        }
        gl.attach_shader(&prog, &s);
    }
    gl.link_program(&prog);
    Ok(prog)
}

/// Unit cube (half extent 1), 36 vertices of position + normal.
fn cube() -> Vec<f32> {
    let mut v = Vec::with_capacity(36 * 6);
    for axis in 0..3 {
        for sign in [-1.0f32, 1.0] {
            let n = |a: f32, b: f32| {
                let mut p = [0.0; 3];
                p[axis] = sign;
                p[(axis + 1) % 3] = a;
                p[(axis + 2) % 3] = b;
                p
            };
            let mut nrm = [0.0; 3];
            nrm[axis] = sign;
            let quad = [n(-1.0, -1.0), n(1.0, -1.0), n(1.0, 1.0), n(-1.0, -1.0), n(1.0, 1.0), n(-1.0, 1.0)];
            let order: [usize; 6] = if sign > 0.0 { [0, 1, 2, 3, 4, 5] } else { [0, 2, 1, 3, 5, 4] };
            for i in order {
                v.extend_from_slice(&quad[i]);
                v.extend_from_slice(&nrm);
            }
        }
    }
    v
}
