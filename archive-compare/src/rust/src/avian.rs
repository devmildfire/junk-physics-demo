use avian3d::prelude::*;
use bevy::prelude::*;
use bevy::time::TimeUpdateStrategy;
use core::time::Duration;

/// Avian in a headless Bevy app; one `app.update()` is one physics step of `DT`.
/// Spawn index, i.e. the body's slot in the instance buffer.
#[derive(Component)]
struct Idx(u32);

pub struct Avian {
    app: App,
    entities: Vec<Entity>,
}

impl Avian {
    pub fn new() -> Self {
        let mut app = App::new();
        app.add_plugins((MinimalPlugins, PhysicsPlugins::new(PostUpdate)))
            .insert_resource(TimeUpdateStrategy::ManualDuration(Duration::from_secs_f32(crate::DT)))
            .insert_resource(Gravity(Vec3::NEG_Y * 9.81));
        app.finish();
        app.cleanup();
        app.world_mut().spawn((
            RigidBody::Static,
            Position(Vec3::new(0.0, -1.0, 0.0)),
            Collider::cuboid(60.0, 2.0, 60.0),
            Friction::new(crate::FRICTION),
            Restitution::new(crate::RESTITUTION),
        ));
        // The first update has a zero time delta; run it now so every measured step advances DT.
        app.update();
        Avian { app, entities: Vec::new() }
    }
}

impl crate::Physics for Avian {
    fn spawn(&mut self, data: &[f32]) {
        let s = crate::HALF * 2.0;
        for b in data.chunks_exact(7) {
            let e = self.app.world_mut().spawn((
                RigidBody::Dynamic,
                Position(Vec3::new(b[0], b[1], b[2])),
                Rotation(Quat::from_xyzw(b[3], b[4], b[5], b[6])),
                Collider::cuboid(s, s, s),
                ColliderDensity(crate::DENSITY),
                Friction::new(crate::FRICTION),
                Restitution::new(crate::RESTITUTION),
                LinearDamping(crate::DAMPING),
                AngularDamping(crate::DAMPING),
                Idx(self.entities.len() as u32),
            ));
            self.entities.push(e.id());
        }
    }

    fn step(&mut self) {
        self.app.update();
    }

    fn sync_active(&mut self, out: &mut Vec<f32>) -> usize {
        out.clear();
        let world = self.app.world_mut();
        let mut q = world.query_filtered::<(&Idx, &Position, &Rotation), Without<Sleeping>>();
        for (i, p, r) in q.iter(world) {
            out.extend_from_slice(&[i.0 as f32, p.x, p.y, p.z, r.x, r.y, r.z, r.w]);
        }
        out.len() / 8
    }

    fn positions(&mut self, out: &mut Vec<f32>) {
        out.clear();
        let world = self.app.world();
        for e in &self.entities {
            let p = world.get::<Position>(*e).unwrap();
            out.extend_from_slice(&[p.x, p.y, p.z]);
        }
    }

    fn awake(&mut self) -> u32 {
        let world = self.app.world_mut();
        let mut q = world.query_filtered::<(), (With<Idx>, Without<Sleeping>)>();
        q.iter(world).count() as u32
    }

    fn worker_threads(&self) -> u32 {
        0
    }
}
