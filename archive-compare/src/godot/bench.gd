extends Node3D
# Godot (built-in Jolt) setup of the fair archive comparison. Mirrors web/shared/spec.js (scene, spawner)
# and web/shared/runner.js (protocol), driven through PhysicsServer3D.
#
# Settings matched to web/shared/jolt-world.js: friction 0.5 (Godot combines with min: equal values give 0.5),
# bounce 0.05 per body (Godot sums: 0.1 like Jolt's max of 0.1 and 0.1), damping 0.05 in REPLACE mode
# (COMBINE would add the world default), shape margin 0.05, mass 1.
#
# Timing. render=0: 600 ticks/s with time_scale 10, so each step is still 1/60 s but many fall in one frame;
# no sync callbacks, nothing drawn. render=1: 60 ticks/s, sync through body_set_state_sync_callback (Godot calls
# it from C++ for bodies that moved, as RigidBody3D does) into a MultiMesh.
# Per tick Godot runs: sync callbacks -> _physics_process -> end_sync + Jolt step -> (frame end: _process, draw).
# step = end of _physics_process -> first of (next sync callback, next _physics_process, _process);
# sync = first sync callback -> next _physics_process.

const DT := 1.0 / 60.0
const HALF := 0.2
const FRICTION := 0.5
const BOUNCE := 0.05
const DAMPING := 0.05
const MARGIN := 0.05
const BATCH_MIN := 10
const BATCH_MAX := 100
const SPAWN_HEIGHT := 40.0
const SPAWN_HALF := 18.0
const SETTLE_CAP := 1200
const FALLEN_Y := -1.0

var n := 2000
var seed_value := 1
var threads := 4
var render := true

var rng_state := 0
var spawned := 0
var batches := 0
var space: RID
var box_shape: RID
var bodies: Array[RID] = []
var mm: MultiMesh

var step := 0
var settle_steps := 0
var settled_at := -1
var lost := [0, 0]
var max_through := 0
var max_off_edge := 0
var spawn_us := 0
var t: Dictionary = {"spawnStep": [], "settleStep": [], "sync": [], "draw": [], "frame": []}
var pending := false
var t_end := 0
var step_end := -1
var cb_first := -1
var last_proc := 0
var last_was_spawning := true
var done := false


func _ready() -> void:
	_read_params()
	if render:
		# One step per frame, like the shared runner: slow frames slow the simulation, never batch it.
		Engine.physics_ticks_per_second = 60
		Engine.max_physics_steps_per_frame = 1
	else:
		Engine.physics_ticks_per_second = 600
		Engine.time_scale = 10.0
		Engine.max_physics_steps_per_frame = 16
	rng_state = seed_value
	space = get_world_3d().space
	PhysicsServer3D.area_set_param(space, PhysicsServer3D.AREA_PARAM_GRAVITY, 9.81)
	PhysicsServer3D.area_set_param(space, PhysicsServer3D.AREA_PARAM_GRAVITY_VECTOR, Vector3.DOWN)
	box_shape = PhysicsServer3D.box_shape_create()
	PhysicsServer3D.shape_set_data(box_shape, Vector3(HALF, HALF, HALF))
	PhysicsServer3D.shape_set_margin(box_shape, MARGIN)
	var floor_shape := PhysicsServer3D.box_shape_create()
	PhysicsServer3D.shape_set_data(floor_shape, Vector3(30, 1, 30))
	PhysicsServer3D.shape_set_margin(floor_shape, MARGIN)
	var floor_body := PhysicsServer3D.body_create()
	PhysicsServer3D.body_set_mode(floor_body, PhysicsServer3D.BODY_MODE_STATIC)
	PhysicsServer3D.body_add_shape(floor_body, floor_shape)
	PhysicsServer3D.body_set_param(floor_body, PhysicsServer3D.BODY_PARAM_FRICTION, FRICTION)
	PhysicsServer3D.body_set_param(floor_body, PhysicsServer3D.BODY_PARAM_BOUNCE, BOUNCE)
	PhysicsServer3D.body_set_state(floor_body, PhysicsServer3D.BODY_STATE_TRANSFORM, Transform3D(Basis(), Vector3(0, -1, 0)))
	PhysicsServer3D.body_set_space(floor_body, space)
	if render:
		_build_view()
	RenderingServer.viewport_set_measure_render_time(get_viewport().get_viewport_rid(), true)


func _read_params() -> void:
	# Web: the page URL. Native (for checks): user args, e.g. `-- n=300 render=0`.
	var query := "&".join(OS.get_cmdline_user_args())
	if OS.has_feature("web"):
		query = String(JavaScriptBridge.eval("location.search", true)).trim_prefix("?")
	for pair in query.split("&", false):
		var kv := pair.split("=")
		if kv.size() != 2:
			continue
		match kv[0]:
			"n": n = int(kv[1])
			"seed": seed_value = int(kv[1])
			"threads": threads = int(kv[1])
			"render": render = kv[1] != "0"


# Same camera, light, colours as the Three.js and Rust renderers; no shadows, no MSAA.
func _build_view() -> void:
	var cam := Camera3D.new()
	cam.fov = 60
	cam.near = 0.2
	cam.far = 2000
	cam.position = Vector3(0, 16, 42)
	add_child(cam)
	cam.look_at(Vector3(0, 8, 0))
	var sun := DirectionalLight3D.new()
	sun.light_energy = 0.65
	sun.shadow_enabled = false
	add_child(sun)
	sun.look_at_from_position(Vector3(0.4, 0.85, 0.35), Vector3.ZERO)
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.043, 0.055, 0.078)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(1, 1, 1)
	env.ambient_light_energy = 0.35
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var floor_mesh := MeshInstance3D.new()
	var fm := BoxMesh.new()
	fm.size = Vector3(60, 2, 60)
	fm.material = _material(Color(0.16, 0.18, 0.22))
	floor_mesh.mesh = fm
	floor_mesh.position = Vector3(0, -1, 0)
	add_child(floor_mesh)
	var bm := BoxMesh.new()
	bm.size = Vector3(HALF * 2, HALF * 2, HALF * 2)
	bm.material = _material(Color(0.78, 0.83, 0.9))
	mm = MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = bm
	mm.instance_count = n
	mm.visible_instance_count = 0
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.custom_aabb = AABB(Vector3(-100, -100, -100), Vector3(200, 200, 200))
	add_child(mmi)


func _material(c: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.specular_mode = BaseMaterial3D.SPECULAR_DISABLED
	m.diffuse_mode = BaseMaterial3D.DIFFUSE_LAMBERT
	m.roughness = 1.0
	return m


# mulberry32 with JavaScript's 32-bit semantics (same sequence as spec.js).
func _imul(a: int, b: int) -> int:
	var lo := (a & 0xFFFF) * (b & 0xFFFF)
	var mid := (((a >> 16) & 0xFFFF) * (b & 0xFFFF) + (a & 0xFFFF) * ((b >> 16) & 0xFFFF)) & 0xFFFF
	return (lo + (mid << 16)) & 0xFFFFFFFF


func _rng() -> float:
	rng_state = (rng_state + 0x6d2b79f5) & 0xFFFFFFFF
	var a := rng_state
	var x := _imul(a ^ (a >> 15), 1 | a)
	x = ((x + _imul(x ^ (x >> 7), 61 | x)) & 0xFFFFFFFF) ^ x
	return float((x ^ (x >> 14)) & 0xFFFFFFFF) / 4294967296.0


# spec.js makeSpawner().due(): 8 batches per simulated second, 10..100 boxes each.
func _spawn_due() -> void:
	if spawned >= n or floori(step * 8.0 / 60.0) < batches:
		return
	batches += 1
	var count := mini(n - spawned, BATCH_MIN + floori(_rng() * (BATCH_MAX - BATCH_MIN + 1)))
	var a := Time.get_ticks_usec()
	for i in count:
		var ax := _rng() * 2.0 - 1.0
		var ay := _rng() * 2.0 - 1.0
		var az := _rng() * 2.0 - 1.0
		var length := sqrt(ax * ax + ay * ay + az * az)
		if length == 0.0:
			length = 1.0
		var angle := _rng() * PI * 2.0
		var s := sin(angle / 2.0) / length
		var q := Quaternion(ax * s, ay * s, az * s, cos(angle / 2.0))
		var x := _rng() * 2.0 * SPAWN_HALF - SPAWN_HALF
		var z := _rng() * 2.0 * SPAWN_HALF - SPAWN_HALF
		_add_body(Transform3D(Basis(q), Vector3(x, SPAWN_HEIGHT, z)))
	spawned += count
	spawn_us += Time.get_ticks_usec() - a


func _add_body(xf: Transform3D) -> void:
	var b := PhysicsServer3D.body_create()
	PhysicsServer3D.body_set_mode(b, PhysicsServer3D.BODY_MODE_RIGID)
	PhysicsServer3D.body_add_shape(b, box_shape)
	PhysicsServer3D.body_set_param(b, PhysicsServer3D.BODY_PARAM_MASS, 1.0)
	PhysicsServer3D.body_set_param(b, PhysicsServer3D.BODY_PARAM_FRICTION, FRICTION)
	PhysicsServer3D.body_set_param(b, PhysicsServer3D.BODY_PARAM_BOUNCE, BOUNCE)
	PhysicsServer3D.body_set_param(b, PhysicsServer3D.BODY_PARAM_LINEAR_DAMP_MODE, PhysicsServer3D.BODY_DAMP_MODE_REPLACE)
	PhysicsServer3D.body_set_param(b, PhysicsServer3D.BODY_PARAM_ANGULAR_DAMP_MODE, PhysicsServer3D.BODY_DAMP_MODE_REPLACE)
	PhysicsServer3D.body_set_param(b, PhysicsServer3D.BODY_PARAM_LINEAR_DAMP, DAMPING)
	PhysicsServer3D.body_set_param(b, PhysicsServer3D.BODY_PARAM_ANGULAR_DAMP, DAMPING)
	PhysicsServer3D.body_set_state(b, PhysicsServer3D.BODY_STATE_TRANSFORM, xf)
	PhysicsServer3D.body_set_space(b, space)
	if render:
		var i := bodies.size()
		mm.set_instance_transform(i, xf)
		mm.visible_instance_count = i + 1
		PhysicsServer3D.body_set_state_sync_callback(b, _on_sync.bind(i))
	bodies.append(b)


func _on_sync(state: PhysicsDirectBodyState3D, i: int) -> void:
	if cb_first < 0:
		cb_first = Time.get_ticks_usec()
	mm.set_instance_transform(i, state.transform)


func _process(_delta: float) -> void:
	var now := Time.get_ticks_usec()
	if pending and step_end < 0:
		step_end = now
	if render and not done:
		if last_proc > 0:
			t.frame.append((now - last_proc) / 1000.0)
		t.draw.append(RenderingServer.viewport_get_measured_render_time_cpu(get_viewport().get_viewport_rid()))
	last_proc = now


func _physics_process(_delta: float) -> void:
	if done:
		return
	var now := Time.get_ticks_usec()
	if pending:
		pending = false
		if step_end < 0:
			step_end = cb_first if cb_first >= 0 else now
		(t.spawnStep if last_was_spawning else t.settleStep).append((step_end - t_end) / 1000.0)
		t.sync.append((now - cb_first) / 1000.0 if cb_first >= 0 else 0.0)
		step += 1
		var spawning := spawned < n
		if not last_was_spawning:
			settle_steps += 1
		if step % 60 == 0:
			_check_lost()
		if not spawning and not last_was_spawning and settle_steps % 15 == 0 and settle_steps > 0:
			_check_lost()
			if _awake_on_floor() <= 0:
				settled_at = settle_steps
		if not spawning and not last_was_spawning and (settled_at >= 0 or settle_steps >= SETTLE_CAP):
			_finish()
			return
	cb_first = -1
	step_end = -1
	var before := spawned
	_spawn_due()
	last_was_spawning = spawned < n or spawned != before
	pending = true
	t_end = Time.get_ticks_usec()


# [below the floor inside its footprint (went through), below it outside (fell off the edge)], as runner.js.
func _check_lost() -> void:
	lost = [0, 0]
	for b in bodies:
		var p: Vector3 = PhysicsServer3D.body_get_state(b, PhysicsServer3D.BODY_STATE_TRANSFORM).origin
		if p.y < FALLEN_Y:
			lost[1 if absf(p.x) > 30.0 or absf(p.z) > 30.0 else 0] += 1
	max_through = maxi(max_through, lost[0])
	max_off_edge = maxi(max_off_edge, lost[1])


# Lost boxes keep falling and never sleep, so they do not count against settling.
func _awake_on_floor() -> int:
	return _awake() - lost[0] - lost[1]


func _awake() -> int:
	# get_process_info(INFO_ACTIVE_OBJECTS) reads 0 on Jolt, so poll each body.
	var c := 0
	for b in bodies:
		if not PhysicsServer3D.body_get_state(b, PhysicsServer3D.BODY_STATE_SLEEPING):
			c += 1
	return c


func _stats(a: Array) -> Variant:
	if a.is_empty():
		return null
	var s := a.duplicate()
	s.sort()
	var total := 0.0
	for v in a:
		total += v
	var q := func(p: float) -> float: return snappedf(s[mini(s.size() - 1, floori(p * s.size()))], 0.001)
	return {"n": s.size(), "p50": q.call(0.5), "p95": q.call(0.95), "max": snappedf(s[-1], 0.001), "mean": snappedf(total / a.size(), 0.001)}


func _finish() -> void:
	done = true
	_check_lost()
	var awake := _awake_on_floor()
	var result := {
		"setup": "godot", "godot": Engine.get_version_info().string, "threads": threads, "workers": threads,
		"n": n, "seed": seed_value, "render": render,
		"bodies": spawned, "steps": step,
		"spawnStepMs": _stats(t.spawnStep), "settleStepMs": _stats(t.settleStep),
		"syncMs": _stats(t.sync) if render else null, "drawMs": _stats(t.draw) if render else null, "frameMs": _stats(t.frame) if render else null,
		"spawnTotalMs": snappedf(spawn_us / 1000.0, 0.1),
		"settleSeconds": snappedf(settled_at / 60.0, 0.01) if settled_at >= 0 else null,
		"awakeAtEnd": awake, "throughFloor": max_through, "offEdge": max_off_edge,
		"settle": "settled" if settled_at >= 0 or awake <= spawned * 0.01 else ("slow" if awake <= spawned * 0.5 else "never"),
		"valid": max_through == 0 and awake <= spawned * 0.5,
	}
	var json := JSON.stringify(result)
	print("RESULT ", json)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.__fairbenchDone(" + json + ");", true)
	else:
		get_tree().quit()
