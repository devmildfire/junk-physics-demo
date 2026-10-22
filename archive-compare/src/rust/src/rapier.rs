use rapier3d::prelude::*;

pub struct Rapier {
    world: PhysicsWorld,
    handles: Vec<RigidBodyHandle>,
}

impl Rapier {
    pub fn new() -> Self {
        let mut world = PhysicsWorld::default();
        world.integration_parameters.dt = crate::DT;
        for (h, c) in crate::STATICS {
            world.insert(
                RigidBodyBuilder::fixed().translation(Vector::new(c[0], c[1], c[2])),
                ColliderBuilder::cuboid(h[0], h[1], h[2]).friction(crate::FRICTION).restitution(crate::RESTITUTION),
            );
        }
        Rapier { world, handles: Vec::new() }
    }
}

impl crate::Physics for Rapier {
    fn spawn(&mut self, data: &[f32]) {
        for b in data.chunks_exact(7) {
            let body = RigidBodyBuilder::dynamic()
                .pose(Pose::from_parts(Vector::new(b[0], b[1], b[2]), Rotation::from_xyzw(b[3], b[4], b[5], b[6])))
                .linear_damping(crate::DAMPING)
                .angular_damping(crate::DAMPING);
            let h = crate::HALF;
            let collider = ColliderBuilder::cuboid(h, h, h)
                .density(crate::DENSITY)
                .friction(crate::FRICTION)
                .restitution(crate::RESTITUTION);
            let (handle, _) = self.world.insert(body, collider);
            // Instance index = spawn order; the statics are handles 0..4, boxes start at 5.
            self.handles.push(handle);
        }
    }

    fn step(&mut self) {
        self.world.step();
    }

    fn sync_active(&mut self, out: &mut Vec<f32>) -> usize {
        out.clear();
        for (handle, body) in self.world.active_bodies() {
            let (i, _) = handle.into_raw_parts();
            let s = crate::STATICS.len() as u32;
            if i < s {
                continue;
            }
            let t = body.translation();
            let r = body.rotation();
            out.extend_from_slice(&[(i - s) as f32, t.x, t.y, t.z, r.x, r.y, r.z, r.w]);
        }
        out.len() / 8
    }

    fn positions(&mut self, out: &mut Vec<f32>) {
        out.clear();
        for h in &self.handles {
            let t = self.world.bodies[*h].translation();
            out.extend_from_slice(&[t.x, t.y, t.z]);
        }
    }

    fn awake(&mut self) -> u32 {
        self.world.active_bodies().count() as u32
    }

    fn worker_threads(&self) -> u32 {
        0
    }
}
