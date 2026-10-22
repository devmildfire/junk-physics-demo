//! One wasm with three physics backends (Jolt via the JS bridge, Rapier, Avian) and one shared
//! WebGL2 renderer, so the Rust rows differ only in physics. Driven by the shared JS runner.
use wasm_bindgen::prelude::*;

mod avian;
mod jolt;
mod rapier;
mod render;

/// Box half extent, density, materials: the archive scene (see shared/spec.json).
pub const HALF: f32 = 0.2;
pub const DENSITY: f32 = 1.0 / (8.0 * HALF * HALF * HALF);
pub const FRICTION: f32 = 0.5;
pub const RESTITUTION: f32 = 0.1;
pub const DAMPING: f32 = 0.05;
pub const DT: f32 = 1.0 / 60.0;

pub trait Physics {
    /// `data` holds 7 floats per body: x y z qx qy qz qw.
    fn spawn(&mut self, data: &[f32]);
    fn step(&mut self);
    /// Writes [instance index, x y z qx qy qz qw] for every awake body into `out`; returns count.
    fn sync_active(&mut self, out: &mut Vec<f32>) -> usize;
    /// Every body's x y z, in spawn order.
    fn positions(&mut self, out: &mut Vec<f32>);
    fn awake(&mut self) -> u32;
    fn worker_threads(&self) -> u32;
}

#[wasm_bindgen]
pub struct Sim {
    phys: Box<dyn Physics>,
    renderer: Option<render::Renderer>,
    active: Vec<f32>,
    inst: Vec<f32>,
    positions: Vec<f32>,
    bodies: usize,
}

#[wasm_bindgen]
impl Sim {
    #[wasm_bindgen(constructor)]
    pub fn new(backend: &str, threads: u32, canvas: Option<web_sys::HtmlCanvasElement>, max_bodies: u32) -> Result<Sim, JsValue> {
        let phys: Box<dyn Physics> = match backend {
            "rapier" => Box::new(rapier::Rapier::new()),
            "avian" => Box::new(avian::Avian::new()),
            "jolt" => Box::new(jolt::Jolt::new(threads)),
            _ => return Err(JsValue::from_str("unknown backend")),
        };
        let renderer = canvas.map(|c| render::Renderer::new(&c, max_bodies as usize)).transpose()?;
        Ok(Sim { phys, renderer, active: Vec::new(), inst: vec![0.0; max_bodies as usize * 7], positions: Vec::new(), bodies: 0 })
    }

    pub fn spawn(&mut self, data: &[f32]) {
        self.inst[self.bodies * 7..self.bodies * 7 + data.len()].copy_from_slice(data);
        self.bodies += data.len() / 7;
        self.phys.spawn(data);
    }

    pub fn step(&mut self) {
        self.phys.step();
    }

    /// Copies awake bodies' transforms into the instance buffer; returns how many were copied.
    pub fn sync(&mut self) -> u32 {
        let n = self.phys.sync_active(&mut self.active);
        for a in self.active[..n * 8].chunks_exact(8) {
            let i = a[0] as usize * 7;
            self.inst[i..i + 7].copy_from_slice(&a[1..8]);
        }
        n as u32
    }

    pub fn render(&mut self) {
        if let Some(r) = &mut self.renderer {
            r.draw(&self.inst[..self.bodies * 7], self.bodies);
        }
    }

    /// Bodies below `y`: [inside the floor's footprint (went through it), outside it (fell off the edge)].
    pub fn lost(&mut self, y: f32, floor_half: f32) -> Vec<u32> {
        self.phys.positions(&mut self.positions);
        let mut out = vec![0, 0];
        for p in self.positions.chunks_exact(3).filter(|p| p[1] < y) {
            out[(p[0].abs() > floor_half || p[2].abs() > floor_half) as usize] += 1;
        }
        out
    }

    pub fn awake(&mut self) -> u32 {
        self.phys.awake()
    }

    pub fn worker_threads(&self) -> u32 {
        self.phys.worker_threads()
    }
}
