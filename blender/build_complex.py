# -*- coding: utf-8 -*-
# STARPORT LC-09 launch complex builder — Blender 5.x headless, exports assets/launch_complex.glb
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

OUT = r"D:/Downloads/新建文件夹/星港发射场/assets/launch_complex.glb"

def lin(h):
    h = h.lstrip('#')
    s = [int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple((c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in s)

MATS = [
    ("concrete",      "#8d8a82", 0.0, 0.92, None, 0),
    ("concrete_dark", "#63615c", 0.0, 0.95, None, 0),
    ("steel",         "#93999f", 0.85, 0.40, None, 0),
    ("steel_dark",    "#43474c", 0.80, 0.52, None, 0),
    ("white",         "#e6e4dc", 0.10, 0.52, None, 0),
    ("red",           "#a52f28", 0.05, 0.58, None, 0),
    ("yellow",        "#c39a33", 0.10, 0.50, None, 0),
    ("asphalt",       "#35373b", 0.0, 0.96, None, 0),
    ("rubber",        "#1d1f23", 0.0, 0.85, None, 0),
    ("beacon",        "#ff2a1a", 0.0, 0.35, "#ff2a1a", 8.0),
    ("lamp",          "#ffdda6", 0.0, 0.30, "#ffd08a", 2.0),
    ("blue",          "#2c4d80", 0.10, 0.50, None, 0),
    ("tank",          "#b9c6cf", 0.25, 0.42, None, 0),
]
M = {name: i for i, (name, *_rest) in enumerate(MATS)}

def make_materials():
    out = []
    for name, hexcol, metal, rough, emit, estr in MATS:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        c = lin(hexcol)
        bsdf.inputs["Base Color"].default_value = (*c, 1.0)
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Roughness"].default_value = rough
        if emit:
            e = lin(emit)
            try:
                bsdf.inputs["Emission Color"].default_value = (*e, 1.0)
                bsdf.inputs["Emission Strength"].default_value = estr
            except Exception:
                pass
        m.use_backface_culling = False
        out.append(m)
    return out

bpy.ops.wm.read_factory_settings(use_empty=True)
MAT_OBJS = make_materials()

# ---------- bmesh helpers (author in Y-up, map into Blender Z-up) ----------
def T(p):
    return (p[0], -p[2], p[1])

def S(sz):
    return (sz[0], sz[2], sz[1])
def tag_faces(res, mi, smooth):
    faces = set()
    for v in res.get('verts', []):
        for f in v.link_faces:
            faces.add(f)
    for f in faces:
        f.material_index = mi
        f.smooth = smooth

def box(bm, center, size, mi, smooth=False, rz=0.0):
    m = (Matrix.Translation(Vector(T(center))) @ Matrix.Rotation(rz, 4, 'Z')
         @ Matrix.Diagonal((size[0], size[2], size[1], 1.0)))
    res = bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    tag_faces(res, mi, smooth)

def tube(bm, a, b, r, mi, seg=8, r2=None, smooth=True):
    a, b = Vector(T(a)), Vector(T(b))
    d = b - a
    L = d.length
    if L < 1e-5:
        return
    q = d.to_track_quat('Z', 'Y')
    m = Matrix.Translation((a + b) * 0.5) @ q.to_matrix().to_4x4()
    res = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                                radius1=r, radius2=(r if r2 is None else r2), depth=L, matrix=m)
    tag_faces(res, mi, smooth)

def ball(bm, center, r, mi, u=20, v=12):
    m = Matrix.Translation(Vector(T(center)))
    try:
        res = bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r, matrix=m)
    except TypeError:
        res = bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, diameter=r, matrix=m)
    tag_faces(res, mi, True)

def slope_box(bm, center, size, mi, rx_deg):
    m = (Matrix.Translation(Vector(T(center))) @ Matrix.Rotation(math.radians(90.0 + rx_deg), 4, 'X')
         @ Matrix.Diagonal((size[0], size[2], size[1], 1.0)))
    res = bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    tag_faces(res, mi, False)

# ---------- scene ----------
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'

bm = bmesh.new()

# ---- pad deck: 88 x 88 slab with 16 m wide flame trench through Z ----
for sx in (-1, 1):
    box(bm, (sx * 26, 2.0, 0), (36, 4.0, 88), M['concrete'])
# deck edge curb
for sx in (-1, 1):
    box(bm, (sx * 44.2, 4.3, 0), (1.4, 0.6, 88), M['concrete_dark'])
# trench inner walls / floor / scorch
for sx in (-1, 1):
    box(bm, (sx * 9.0, -0.5, 0), (2.0, 9.0, 100), M['concrete_dark'])
box(bm, (0, -5.0, 0), (16.4, 0.6, 100), M['concrete_dark'])
box(bm, (0, -4.75, 20), (15.0, 0.1, 30), M['rubber'])
# deflector ramp under the rocket
slope_box(bm, (0, -1.2, 7.0), (17.0, 1.2, 24.0), M['steel_dark'], -8.0)
box(bm, (0, -2.0, -12.0), (17.0, 0.8, 10.0), M['steel_dark'])
# trench exit lips
for sz in (-1, 1):
    box(bm, (0, 4.0, sz * 48.0), (18.0, 4.0, 8.0), M['concrete_dark'])

# hazard stripe border on deck
for sx in (-1, 1):
    for sz in (-1, 1):
        box(bm, (sx * 43.0, 4.1, 0), (0.8, 0.15, 84), M['yellow'])

# ---- launch mount ----
for sx in (-1, 1):
    for sz in (-1, 1):
        box(bm, (sx * 7.0, 7.0, sz * 7.0), (2.0, 6.0, 2.0), M['steel_dark'])
# table ring beams
for sx in (-1, 1):
    box(bm, (sx * 7.6, 10.0, 0), (1.6, 1.6, 17.0), M['steel_dark'])
for sz in (-1, 1):
    box(bm, (0, 10.0, sz * 7.6), (17.0, 1.6, 1.6), M['steel_dark'])
box(bm, (0, 11.2, 0), (13.0, 0.7, 13.0), M['steel'])
# hold-down clamps
for sx in (-1, 1):
    for sz in (-1, 1):
        box(bm, (sx * 4.0, 12.6, sz * 4.0), (1.3, 3.4, 1.3), M['steel'])
        tube(bm, (sx * 4.0, 14.0, sz * 4.0), (sx * 4.0, 15.6, sz * 4.0), 0.45, M['steel_dark'], seg=10)
# flame hole lip
for i in range(4):
    ang = i * math.pi / 2
    box(bm, (math.cos(ang) * 6.8, 10.9, math.sin(ang) * 6.8), (5.0, 0.8, 1.2), M['red'], rz=ang)

# ---- service tower: core at (-26, 0, -1), 96 m tall ----
TX, TZ, TH = -26.0, -1.0, 96.0
for sx in (-1, 1):
    for sz in (-1, 1):
        box(bm, (TX + sx * 6.5, 4 + TH / 2, TZ + sz * 6.5), (1.1, TH, 1.1), M['steel'])
# base plinth
box(bm, (TX, 2.2, TZ), (16.0, 4.4, 30.0), M['concrete_dark'])
# horizontal rings + diagonals
levels = [8 + i * 8 for i in range(12)]
for y in levels:
    for sz in (-1, 1):
        tube(bm, (TX - 6.5, y, TZ + sz * 6.5), (TX + 6.5, y, TZ + sz * 6.5), 0.28, M['steel'], seg=6)
    for sx in (-1, 1):
        tube(bm, (TX + sx * 6.5, y, TZ - 6.5), (TX + sx * 6.5, y, TZ + 6.5), 0.28, M['steel'], seg=6)
# diagonal bracing on all four faces
for i in range(len(levels) - 1):
    y0, y1 = levels[i], levels[i + 1]
    for sz in (-1, 1):
        tube(bm, (TX - 6.5, y0, TZ + sz * 6.5), (TX + 6.5, y1, TZ + sz * 6.5), 0.18, M['steel_dark'], seg=5)
        tube(bm, (TX + 6.5, y0, TZ + sz * 6.5), (TX - 6.5, y1, TZ + sz * 6.5), 0.18, M['steel_dark'], seg=5)
    for sx in (-1, 1):
        tube(bm, (TX + sx * 6.5, y0, TZ - 6.5), (TX + sx * 6.5, y1, TZ + 6.5), 0.18, M['steel_dark'], seg=5)
        tube(bm, (TX + sx * 6.5, y0, TZ + 6.5), (TX + sx * 6.5, y1, TZ - 6.5), 0.18, M['steel_dark'], seg=5)
# platforms
for i, y in enumerate([12, 20, 28, 44, 52, 68, 76, 84, 92]):
    box(bm, (TX, y, TZ), (15.0, 0.35, 15.0), M['steel_dark'])
    # railings (three sides, front open towards rocket)
    for sz in (-1, 1):
        box(bm, (TX, y + 0.9, TZ + sz * 7.2), (13.0, 0.1, 0.1), M['yellow'])
        for k in range(5):
            box(bm, (TX - 6.0 + k * 3.0, y + 0.55, TZ + sz * 7.2), (0.09, 1.1, 0.09), M['yellow'])
    box(bm, (TX - 6.0, y + 0.9, TZ), (0.1, 0.1, 13.0), M['yellow'])
# elevator shaft
box(bm, (TX, 4 + TH / 2, TZ - 3.6), (4.2, TH, 3.4), M['steel_dark'])
tube(bm, (TX, 4, TZ - 1.2), (TX, 100, TZ - 1.2), 1.2, M['steel'], seg=12)
# red/white top band
box(bm, (TX, 96.0, TZ), (14.2, 3.0, 14.2), M['red'])
# tower cap room
box(bm, (TX, 100.5, TZ), (12.0, 3.0, 11.0), M['white'])
# crane jib
box(bm, (TX + 8.0, 102.4, TZ), (22.0, 1.0, 1.2), M['steel'])
for k in range(6):
    x = TX + 1.0 + k * 3.6
    tube(bm, (x, 101.2, TZ), (x, 102.4, TZ + 1.0), 0.10, M['steel'], seg=5)
box(bm, (TX + 18.6, 101.5, TZ), (1.8, 2.0, 2.0), M['yellow'])
box(bm, (TX - 3.0, 102.4, TZ), (6.0, 1.4, 1.8), M['steel_dark'])
# lightning rod on tower
tube(bm, (TX, 102.0, TZ), (TX, 116.0, TZ), 0.22, M['steel'], r2=0.05, seg=6)
ball(bm, (TX, 116.2, TZ), 0.42, M['beacon'], u=10, v=8)
# tower platform lamps
for y in (28, 52, 76, 92):
    for sx in (-1, 1):
        box(bm, (TX + sx * 7.0, y + 0.7, TZ + 7.0), (0.6, 0.25, 0.4), M['lamp'])

# ---- swing arms (separate objects, hinge at tower face) ----
def build_arm(name, hy, length=15.0):
    abm = bmesh.new()
    # white insulated room
    box(abm, (5.4, 1.7, 0), (8.6, 3.4, 3.8), 0)
    # truss chords
    for sy in (0.0, 3.4):
        for sz in (-1, 1):
            tube(abm, (0.4, sy, sz * 1.9), (length, sy, sz * 1.9), 0.13, 1, seg=5)
    # diagonal truss
    for k in range(6):
        x0 = 0.8 + k * 2.4
        for sz in (-1, 1):
            tube(abm, (x0, 0.0, sz * 1.9), (x0 + 1.2, 3.4, sz * 1.9), 0.09, 1, seg=5)
            tube(abm, (x0 + 1.2, 3.4, sz * 1.9), (x0 + 2.4, 0.0, sz * 1.9), 0.09, 1, seg=5)
    # hinge barrel
    tube(abm, (0.0, -1.8, 0.0), (0.0, 1.8, 0.0), 0.55, 1, seg=10)
    # end connector collar
    box(abm, (length + 0.1, 1.7, 0), (0.8, 4.2, 4.6), 1)
    for sy in (-0.2, 3.6):
        box(abm, (length + 0.6, sy, 0), (0.5, 0.6, 3.0), 1)
    mesh = bpy.data.meshes.new(name + "_mesh")
    abm.to_mesh(mesh)
    abm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = T((TX + 6.5, hy, TZ))
    scene.collection.objects.link(obj)
    mesh.materials.append(MAT_OBJS[M['white']])
    mesh.materials.append(MAT_OBJS[M['steel_dark']])
    for p in mesh.polygons:
        p.use_smooth = False
    return obj

for name, hy in (("arm_bottom", 26.0), ("arm_mid", 50.0), ("arm_top", 64.0)):
    build_arm(name, hy)

# ---- lightning masts ----
MASTS = []
for ang_deg, rad in ((80, 62), (200, 62), (320, 62)):
    a = math.radians(ang_deg)
    x, z = math.cos(a) * rad, math.sin(a) * rad
    tube(bm, (x, 0.5, z), (x, 108.0, z), 1.15, M['steel'], r2=0.35, seg=10)
    ball(bm, (x, 108.4, z), 0.55, M['beacon'], u=10, v=8)
    box(bm, (x, 0.35, z), (3.0, 0.7, 3.0), M['concrete_dark'])
    tube(bm, (x, 1.0, z), (x, 22.0, z), 1.4, M['concrete'], seg=10)
    MASTS.append((x, z))
# catenary wires between mast tops
for i in range(3):
    x0, z0 = MASTS[i]
    x1, z1 = MASTS[(i + 1) % 3]
    tube(bm, (x0, 105.5, z0), (x1, 105.5, z1), 0.045, M['steel_dark'], seg=4)
    tube(bm, (x0, 96.0, z0), (x1, 96.0, z1), 0.045, M['steel_dark'], seg=4)

# ---- propellant spheres ----
def sphere_tank(cx, cz, r, mi):
    ball(bm, (cx, r + 5.0, cz), r, mi, u=28, v=18)
    for k in range(6):
        a = math.radians(60 * k)
        lx, lz = math.cos(a) * r * 0.72, math.sin(a) * r * 0.72
        tube(bm, (cx + lx, 0.2, cz + lz), (cx + lx * 0.55, 5.0 + r * 0.7, cz + lz * 0.55), 0.26, M['steel'])
    # frost jacket band
    tube(bm, (cx, r + 5.0, cz), (cx, r + 5.4, cz), r * 1.002, M['white'], seg=24)

sphere_tank(152, -166, 9.5, M['tank'])
sphere_tank(-62, 34, 8.5, M['tank'])
# piping runs
tube(bm, (-45, 1.0, 36), (-16, 1.0, 24), 0.45, M['steel'], seg=8)
tube(bm, (-16, 1.0, 24), (-8, 1.0, 14), 0.45, M['steel'], seg=8)

# ---- water tower ----
WX, WZ = 142.0, -156.0
for k in range(4):
    a = math.radians(45 + 90 * k)
    lx, lz = math.cos(a) * 5.5, math.sin(a) * 5.5
    tube(bm, (WX + lx, 0.2, WZ + lz), (WX + lx * 0.4, 30.0, WZ + lz * 0.4), 0.42, M['steel'], seg=6)
box(bm, (WX, 30.0, WZ), (12.0, 1.0, 12.0), M['steel_dark'])
tube(bm, (WX, 30.0, WZ), (WX, 32.0, WZ), 6.8, M['white'], seg=24)
tube(bm, (WX, 32.0, WZ), (WX, 44.0, WZ), 6.8, M['white'], seg=24)
tube(bm, (WX, 44.0, WZ), (WX, 44.5, WZ), 7.0, M['steel'], seg=24)
box(bm, (WX, 32.5, WZ + 6.9), (1.6, 6.0, 0.4), M['blue'])
ball(bm, (WX, 45.0, WZ), 0.5, M['beacon'], u=8, v=6)

# ---- floodlight masts around pad ----
for ang_deg in (45, 135, 225, 315):
    a = math.radians(ang_deg)
    x, z = math.cos(a) * 52, math.sin(a) * 52
    tube(bm, (x, 0.3, z), (x, 28.0, z), 0.55, M['steel'], r2=0.34, seg=8)
    box(bm, (x, 29.0, z), (9.0, 0.5, 2.2), M['steel_dark'], rz=a + math.pi / 2)
    for k in range(3):
        off = (k - 1) * 3.0
        ox, oz = math.cos(a + math.pi / 2) * off, math.sin(a + math.pi / 2) * off
        box(bm, (x + ox, 29.4, z + oz), (2.0, 0.3, 1.6), M['lamp'], rz=a + math.pi / 2)
    box(bm, (x, 1.2, z), (3.4, 1.6, 3.4), M['concrete_dark'])

# ---- pad perimeter lights ----
for k in range(24):
    a = math.radians(k * 15)
    x, z = math.cos(a) * 47, math.sin(a) * 47
    ball(bm, (x, 4.6, z), 0.28, M['lamp'], u=8, v=6)
# corner aviation beacons
for sx in (-1, 1):
    for sz in (-1, 1):
        tube(bm, (sx * 46, 4.3, sz * 46), (sx * 46, 8.0, sz * 46), 0.16, M['steel'], seg=6)
        ball(bm, (sx * 46, 8.2, sz * 46), 0.32, M['beacon'], u=8, v=6)

# ---- assembly building (VAB) far back ----
VX, VZ = 6.0, -240.0
box(bm, (VX, 46.0, VZ), (72.0, 92.0, 52.0), M['concrete'])
for k in range(9):
    box(bm, (VX - 32 + k * 8.0, 46.0, VZ + 26.2), (1.2, 92.0, 0.8), M['concrete_dark'])
for k in range(5):
    box(bm, (VX, 10 + k * 18.0, VZ + 26.4), (70.0, 0.5, 0.7), M['concrete_dark'])
box(bm, (VX, 28.0, VZ + 27.2), (26.0, 56.0, 1.4), M['steel_dark'])
box(bm, (VX, 57.0, VZ + 27.4), (28.0, 1.0, 2.0), M['red'])
# building roof plant
box(bm, (VX - 18, 94.0, VZ), (10.0, 8.0, 18.0), M['steel_dark'])
box(bm, (VX + 16, 94.0, VZ), (16.0, 6.0, 10.0), M['steel_dark'])
# floodlights on building
for sx in (-1, 1):
    ball(bm, (VX + sx * 26, 92.5, VZ + 27.0), 0.6, M['beacon'], u=8, v=6)

# ---- roads ----
box(bm, (0, 0.06, 96), (12.0, 0.12, 72.0), M['asphalt'])
box(bm, (VX, 0.06, (VZ + 46) / 2 - 0.0), (12.0, 0.12, 150.0), M['asphalt'])
box(bm, (24, 0.07, 0), (0.5, 0.14, 88.0), M['yellow'])
# crawlerway pads
for sx in (-1, 1):
    box(bm, (sx * 12.0, 0.1, 70.0), (3.0, 0.2, 20.0), M['concrete_dark'])

# ---- pad support sheds ----
for sx in (-1, 1):
    box(bm, (sx * 38.0, 3.0, 36.0), (12.0, 6.0, 8.0), M['concrete_dark'])
    box(bm, (sx * 38.0, 6.8, 36.0), (12.6, 0.5, 8.6), M['steel_dark'])

# ---------- finalize static mesh ----------
mesh = bpy.data.meshes.new("LC_Static")
bm.to_mesh(mesh)
bm.free()
for p in mesh.polygons:
    p.use_smooth = False
for m in MAT_OBJS:
    mesh.materials.append(m)
static = bpy.data.objects.new("LC_Static", mesh)
scene.collection.objects.link(static)

# export
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', export_apply=True, export_yup=True,
    export_materials='EXPORT', export_cameras=False, export_lights=False,
    export_extras=True,
)
print("EXPORTED", OUT, os.path.getsize(OUT), "bytes")
print("OBJECTS", [o.name for o in bpy.data.objects])
