//! JoltPhysics.js reached through a JS bridge, as in the archive, but with statically bound
//! imports and bulk copies instead of a name lookup per call.
use wasm_bindgen::prelude::*;

#[wasm_bindgen(module = "/js/jolt-bridge.js")]
extern "C" {
    fn jb_create(threads: u32) -> u32;
    fn jb_spawn(data: &[f32]);
    fn jb_step();
    fn jb_sync_active(out: &mut [f32]) -> u32;
    fn jb_positions(out: &mut [f32]);
    fn jb_awake() -> u32;
}

pub struct Jolt {
    threads: u32,
    bodies: usize,
}

impl Jolt {
    pub fn new(threads: u32) -> Self {
        Jolt { threads: jb_create(threads), bodies: 0 }
    }
}

impl crate::Physics for Jolt {
    fn spawn(&mut self, data: &[f32]) {
        self.bodies += data.len() / 7;
        jb_spawn(data);
    }

    fn step(&mut self) {
        jb_step();
    }

    fn sync_active(&mut self, out: &mut Vec<f32>) -> usize {
        out.resize(self.bodies * 8, 0.0);
        jb_sync_active(out) as usize
    }

    fn positions(&mut self, out: &mut Vec<f32>) {
        out.resize(self.bodies * 3, 0.0);
        jb_positions(out);
    }

    fn awake(&mut self) -> u32 {
        jb_awake()
    }

    fn worker_threads(&self) -> u32 {
        self.threads
    }
}
