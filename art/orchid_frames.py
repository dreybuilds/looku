"""Build and photograph looku's acetate frames in a fresh headless Blender scene."""
import bpy, math, os, sys
from mathutils import Vector
from pathlib import Path

out = Path(sys.argv[sys.argv.index('--')+1])
out.mkdir(exist_ok=True, parents=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene

def material(name, color, rough, metal=0):
    mat=bpy.data.materials.new(name)
    mat.diffuse_color=(*color,1)
    mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF')
    for key,value in [('Base Color',(*color,1)),('Roughness',rough),('Metallic',metal)]:
        shader.inputs[key].default_value=value
    return mat

plum=material('Polished plum acetate',(.19,.008,.103),.2)
lens=material('Smoked violet lens',(.034,.012,.048),.12,.48)
silver=material('Silver rivets',(.8,.7,.85),.22,.9)

def tube(name,coords,mat,radius,closed=False):
    curve=bpy.data.curves.new(name,'CURVE')
    curve.dimensions='3D'
    curve.resolution_u=3
    curve.bevel_depth=radius
    curve.bevel_resolution=3
    curve.use_fill_caps=True
    spline=curve.splines.new('POLY')
    spline.points.add(len(coords)-1)
    for pt,xyz in zip(spline.points,coords): pt.co=(*xyz,1)
    spline.use_cyclic_u=closed
    obj=bpy.data.objects.new(name,curve)
    scene.collection.objects.link(obj)
    obj.data.materials.append(mat)

for side in [-1,1]:
    shape=[]
    for i in range(64):
        t=i*math.tau/64
        def rounded(x): return math.copysign(abs(x)**.48,x)
        u,v=rounded(math.cos(t)),rounded(math.sin(t))
        x=side*(.033+.029*u)
        z=.023+.018*v+.002*u
        shape.append((x,.004*u*u+.003*u,z))
    tube('Acetate rim',shape,plum,.0037,True)
    points=[(x,y+.001,z) for x,y,z in shape]
    mesh=bpy.data.meshes.new('Curved lens')
    mesh.from_pydata(points+[(side*.033,-.0004,.023)],[],[(64,i,(i+1)%64) for i in range(64)])
    mesh.update()
    obj=bpy.data.objects.new('Tinted lens',mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(lens)
    mod=obj.modifiers.new('Lens thickness','SOLIDIFY')
    mod.thickness=.001
    for poly in mesh.polygons: poly.use_smooth=True
    tube('Curved arm',[(side*x,y,z) for x,y,z in [(.060,.006,.033),(.065,.013,.033),(.067,.06,.030),(.066,.099,.028),(.064,.108,.023),(.061,.121,.010),(.060,.124,.010)]],plum,.003)
    for x in [.054,.058]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=.00125,location=(side*x,.0006,.0405))
        bpy.context.object.data.materials.append(silver)
tube('Saddle bridge',[(-.010,0,.029),(-.006,-.001,.031),(0,-.002,.032),(.006,-.001,.031),(.010,0,.029)],plum,.003)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.convert(target='MESH')
parts=list(bpy.context.selected_objects)
bpy.ops.export_scene.gltf(filepath=str(out/'orchid-frames.glb'),use_selection=True,export_format='GLB')
bpy.ops.object.camera_add()
camera=bpy.context.object
camera.data.type='ORTHO'
camera.data.ortho_scale=.205
camera.data.clip_start=.001
scene.camera=camera

def aim(obj,target): obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
def light(name,xyz,power,size):
    bpy.ops.object.light_add(type='AREA',location=xyz)
    lamp=bpy.context.object
    lamp.name=name
    lamp.data.energy=power
    lamp.data.shape='DISK'
    lamp.data.size=size
    aim(lamp,(0,.04,.02))
light('Large softbox',(-.10,-.14,.20),2,.16)
light('Edge strip',(.13,.10,.14),3,.12)
light('Front fill',(.08,-.20,.07),1,.08)
scene.world=bpy.data.worlds.new('Studio')
scene.world.color=(.32,.29,.35)
scene.render.engine='CYCLES'
scene.cycles.samples=8
scene.render.threads_mode='FIXED'
scene.render.threads=4
scene.render.film_transparent=True
scene.render.resolution_x=480
scene.render.resolution_y=288
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
for i in range(24):
    a=math.radians(25+15*i)
    camera.location=(.35*math.sin(a),.049-.35*math.cos(a),.171)
    aim(camera,(0,.049,.021))
    scene.render.filepath=str(out/f'frame-{i:02}.png')
    bpy.ops.render.render(write_still=True)
