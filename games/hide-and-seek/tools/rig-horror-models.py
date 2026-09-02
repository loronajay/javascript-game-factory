"""Build authored armatures and animation clips for the two static horror sculptures.

Run with Blender, not system Python:
  blender --background --python tools/rig-horror-models.py -- <project-root>
"""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


PROFILES = {
    "gaunt": {
        "source": "gaunt-horror.glb",
        "output": "gaunt-horror-rigged.glb",
        "height": 2.03,
        "pelvis": 0.96,
        "spine": (1.00, 1.25, 1.49),
        "neck": (1.49, 1.68),
        "head": (1.68, 1.96),
        "shoulder": (0.25, 1.49),
        "elbow": (0.31, 1.12),
        "wrist": (0.29, 0.76),
        "hand": (0.26, 0.50),
        "hip_x": 0.125,
        "knee": (0.13, 0.53),
        "ankle": (0.14, 0.12),
        "toe_y": -0.20,
    },
    "nurse": {
        "source": "silent-horror-nurse.glb",
        "output": "silent-horror-nurse-rigged.glb",
        "height": 1.98,
        "pelvis": 1.00,
        "spine": (1.04, 1.27, 1.48),
        "neck": (1.48, 1.66),
        "head": (1.66, 1.94),
        "shoulder": (0.215, 1.49),
        "elbow": (0.255, 1.20),
        "wrist": (0.235, 0.92),
        "hand": (0.225, 0.76),
        "hip_x": 0.10,
        "knee": (0.10, 0.53),
        "ankle": (0.09, 0.11),
        "toe_y": -0.18,
    },
}


def clear_scene():
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.armatures, bpy.data.meshes, bpy.data.actions):
        for block in list(datablocks):
            datablocks.remove(block)


def select_only(*objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[-1]


def import_creature(source, target_height):
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"{source.name}: no mesh imported")
    for mesh in meshes:
        world = mesh.matrix_world.copy()
        mesh.parent = None
        mesh.matrix_world = world
    select_only(*meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    mesh = bpy.context.view_layer.objects.active
    mesh.name = "CreatureMesh"
    mesh.data.name = "CreatureMesh"
    select_only(mesh)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    corners = [mesh.matrix_world @ Vector(corner) for corner in mesh.bound_box]
    minimum = Vector((min(point.x for point in corners), min(point.y for point in corners), min(point.z for point in corners)))
    maximum = Vector((max(point.x for point in corners), max(point.y for point in corners), max(point.z for point in corners)))
    scale = target_height / (maximum.z - minimum.z)
    mesh.scale = (scale, scale, scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    corners = [mesh.matrix_world @ Vector(corner) for corner in mesh.bound_box]
    minimum = Vector((min(point.x for point in corners), min(point.y for point in corners), min(point.z for point in corners)))
    maximum = Vector((max(point.x for point in corners), max(point.y for point in corners), max(point.z for point in corners)))
    mesh.location = (-(minimum.x + maximum.x) * 0.5, -(minimum.y + maximum.y) * 0.5, -minimum.z)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    return mesh


def make_armature(profile_name, profile):
    data = bpy.data.armatures.new(f"{profile_name.title()}Rig")
    armature = bpy.data.objects.new(f"{profile_name.title()}Rig", data)
    bpy.context.collection.objects.link(armature)
    armature.show_in_front = True
    select_only(armature)
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(name, head, tail, parent=None, connected=False, deform=True):
        item = data.edit_bones.new(name)
        item.head = head
        item.tail = tail
        item.parent = parent
        item.use_connect = connected
        item.use_deform = deform
        item.head_radius = 0.12
        item.tail_radius = 0.10
        item.envelope_distance = 0.55
        return item

    pelvis_z = profile["pelvis"]
    spine_a, spine_b, spine_c = profile["spine"]
    neck_a, neck_b = profile["neck"]
    head_a, head_b = profile["head"]
    root = bone("Root", (0, 0, 0), (0, 0, 0.16), deform=False)
    pelvis = bone("Pelvis", (0, 0, pelvis_z), (0, 0, spine_a), root)
    spine = bone("Spine", (0, 0, spine_a), (0, 0, spine_b), pelvis, connected=True)
    chest = bone("Chest", (0, 0, spine_b), (0, 0, spine_c), spine, connected=True)
    neck = bone("Neck", (0, 0, neck_a), (0, 0, neck_b), chest, connected=True)
    bone("Head", (0, 0, head_a), (0, 0, head_b), neck, connected=True)

    for side, suffix in ((-1, ".L"), (1, ".R")):
        shoulder_x, shoulder_z = profile["shoulder"]
        elbow_x, elbow_z = profile["elbow"]
        wrist_x, wrist_z = profile["wrist"]
        hand_x, hand_z = profile["hand"]
        clavicle = bone(f"Clavicle{suffix}", (0, 0, shoulder_z), (side * shoulder_x, 0, shoulder_z), chest)
        upper = bone(f"UpperArm{suffix}", (side * shoulder_x, 0, shoulder_z), (side * elbow_x, 0, elbow_z), clavicle, connected=True)
        forearm = bone(f"Forearm{suffix}", (side * elbow_x, 0, elbow_z), (side * wrist_x, 0, wrist_z), upper, connected=True)
        bone(f"Hand{suffix}", (side * wrist_x, 0, wrist_z), (side * hand_x, 0, hand_z), forearm, connected=True)

        hip_x = profile["hip_x"]
        knee_x, knee_z = profile["knee"]
        ankle_x, ankle_z = profile["ankle"]
        thigh = bone(f"Thigh{suffix}", (side * hip_x, 0, pelvis_z), (side * knee_x, 0, knee_z), pelvis)
        shin = bone(f"Shin{suffix}", (side * knee_x, 0, knee_z), (side * ankle_x, 0, ankle_z), thigh, connected=True)
        bone(f"Foot{suffix}", (side * ankle_x, 0, ankle_z), (side * ankle_x, profile["toe_y"], 0.055), shin, connected=True)

    bpy.ops.object.mode_set(mode="OBJECT")
    return armature


def parent_with_clean_weights(mesh, armature, profile_name):
    select_only(mesh, armature)
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")

    def weight_coverage():
        deform_groups = {
            group.index for group in mesh.vertex_groups
            if group.name in armature.data.bones and armature.data.bones[group.name].use_deform
        }
        weighted = sum(
            1 for vertex in mesh.data.vertices
            if any(item.group in deform_groups and item.weight > 1e-5 for item in vertex.groups)
        )
        return weighted, weighted / max(1, len(mesh.data.vertices))

    weighted, coverage = weight_coverage()
    if coverage < 0.98:
        # The gaunt is a dense, self-contacting sculpt; Blender's heat solver rejects it. Bone
        # envelopes provide a deterministic Blender-side fallback that follows the authored bone
        # segments and does not confuse the hand/knee contact as one body region.
        print(f"HEAT WEIGHTS INCOMPLETE {profile_name}: {coverage:.2%}; retrying with bone envelopes")
        for modifier in list(mesh.modifiers):
            if modifier.type == "ARMATURE":
                mesh.modifiers.remove(modifier)
        for group in list(mesh.vertex_groups):
            mesh.vertex_groups.remove(group)
        mesh.parent = None
        select_only(mesh, armature)
        bpy.ops.object.parent_set(type="ARMATURE_ENVELOPE")
        weighted, coverage = weight_coverage()

    # Make the skin relationship explicit even if Blender's parent operator only generated groups.
    modifier = next((item for item in mesh.modifiers if item.type == "ARMATURE"), None)
    if modifier is None:
        modifier = mesh.modifiers.new(name="CreatureRig", type="ARMATURE")
    modifier.object = armature
    mesh.parent = armature
    print(f"WEIGHT COVERAGE {profile_name}: {weighted}/{len(mesh.data.vertices)} ({coverage:.2%})")
    if coverage < 0.98:
        raise RuntimeError(f"{profile_name}: only {coverage:.2%} of vertices received armature weights")

    # The gaunt source pose places its left hand against its knee. Heat weighting understands the
    # surface topology, but this cleanup explicitly forbids the contact patch from sharing arm and
    # leg groups, preventing the exact glued-hand failure that rejected the runtime auto-rig.
    if profile_name == "gaunt":
        group_index = {group.name: group.index for group in mesh.vertex_groups}
        for vertex in mesh.data.vertices:
            if not (0.34 <= vertex.co.z <= 0.92):
                continue
            side = ".L" if vertex.co.x < 0 else ".R"
            arm_names = [f"UpperArm{side}", f"Forearm{side}", f"Hand{side}"]
            leg_names = [f"Thigh{side}", f"Shin{side}", f"Foot{side}"]
            weights = {item.group: item.weight for item in vertex.groups}
            arm_weight = sum(weights.get(group_index[name], 0) for name in arm_names)
            leg_weight = sum(weights.get(group_index[name], 0) for name in leg_names)
            if arm_weight > 0.08 and arm_weight >= leg_weight * 0.72:
                for name in leg_names:
                    mesh.vertex_groups[name].remove([vertex.index])
            elif leg_weight > 0.08 and leg_weight > arm_weight:
                for name in arm_names:
                    mesh.vertex_groups[name].remove([vertex.index])

    if profile_name == "nurse":
        rigidify_loose_components(mesh, armature, maximum_height=1.08, maximum_vertices=2500)

    select_only(mesh)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)


def rigidify_loose_components(mesh, armature, maximum_height, maximum_vertices):
    """Give each small disconnected costume/boot island one coherent transform.

    The nurse sculpt's shin guards and boot fragments are separate shells. Per-vertex heat weights
    make opposite corners follow different bones and visually explode those rigid pieces on a step.
    A shared four-bone blend preserves each island while letting it follow the surrounding limb.
    """
    adjacency = [[] for _ in mesh.data.vertices]
    for edge in mesh.data.edges:
        left, right = edge.vertices
        adjacency[left].append(right)
        adjacency[right].append(left)
    remaining = set(range(len(mesh.data.vertices)))
    components = []
    while remaining:
        seed = remaining.pop()
        component = [seed]
        cursor = 0
        while cursor < len(component):
            for neighbor in adjacency[component[cursor]]:
                if neighbor in remaining:
                    remaining.remove(neighbor)
                    component.append(neighbor)
            cursor += 1
        components.append(component)

    deform_names = {bone.name for bone in armature.data.bones if bone.use_deform}
    group_names = {group.index: group.name for group in mesh.vertex_groups if group.name in deform_names}
    corrected = 0
    for component in components:
        if not 6 <= len(component) <= maximum_vertices:
            continue
        mean_height = sum(mesh.data.vertices[index].co.z for index in component) / len(component)
        if mean_height >= maximum_height:
            continue
        totals = {}
        for index in component:
            for assignment in mesh.data.vertices[index].groups:
                name = group_names.get(assignment.group)
                if name:
                    totals[name] = totals.get(name, 0.0) + assignment.weight
        strongest = sorted(totals.items(), key=lambda item: item[1], reverse=True)[:4]
        total = sum(weight for _, weight in strongest)
        if total <= 1e-8:
            continue
        for name in deform_names:
            group = mesh.vertex_groups.get(name)
            if group:
                group.remove(component)
        for name, weight in strongest:
            mesh.vertex_groups[name].add(component, weight / total, "REPLACE")
        corrected += 1
    print(f"RIGID LOOSE PIECES: {corrected}/{len(components)}")


def clear_pose(armature):
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "XYZ"
        pose_bone.rotation_euler = (0, 0, 0)
        pose_bone.location = (0, 0, 0)
        pose_bone.scale = (1, 1, 1)


def set_pose(armature, frame, rotations, locations=None):
    clear_pose(armature)
    for name, values in rotations.items():
        bone = armature.pose.bones.get(name)
        if bone:
            bone.rotation_euler = values
    for name, values in (locations or {}).items():
        bone = armature.pose.bones.get(name)
        if bone:
            bone.location = values
    for name in set(rotations) | set(locations or {}):
        bone = armature.pose.bones.get(name)
        if not bone:
            continue
        bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=name)
        if locations and name in locations:
            bone.keyframe_insert(data_path="location", frame=frame, group=name)


def finish_action(action, end_frame):
    action.frame_start = 1
    action.frame_end = end_frame
    action.use_fake_user = True


def create_action(armature, name, keyframes, end_frame):
    action = bpy.data.actions.new(name=name)
    armature.animation_data_create()
    armature.animation_data.action = action
    for frame, rotations, locations in keyframes:
        set_pose(armature, frame, rotations, locations)
    finish_action(action, end_frame)
    armature.animation_data.action = None
    return action


def locomotion_keys(profile_name, chase=False):
    if chase:
        end = 32
        frames = [1, 9, 17, 25, 33]
        stride = 0.66 if profile_name == "gaunt" else 0.54
        knee = 0.68
        arm = 0.52 if profile_name == "gaunt" else 0.38
        lift = 0.034
    else:
        end = 64
        frames = [1, 17, 33, 49, 65]
        stride = 0.44 if profile_name == "gaunt" else 0.35
        knee = 0.48
        arm = 0.34 if profile_name == "gaunt" else 0.27
        lift = 0.026
    phases = [1, 0, -1, 0, 1]
    keys = []
    for frame, phase in zip(frames, phases):
        if profile_name == "gaunt":
            base = {
                "Pelvis": (0.04, 0, 0.055 * phase),
                "Spine": (0.16, 0.045 * phase, -0.055 * phase),
                "Chest": (0.20, -0.07 * phase, 0.08 * phase),
                "Neck": (-0.10, 0.025 * phase, -0.025 * phase),
                "Head": (-0.10, 0.07 * phase, 0.045 * phase),
                "Clavicle.L": (0, 0, 0.055 - 0.04 * phase),
                "Clavicle.R": (0, 0, -0.075 - 0.055 * phase),
                "UpperArm.L": (-arm * phase - 0.06, 0, 0.09),
                "UpperArm.R": (arm * phase + 0.03, 0, -0.14),
                "Forearm.L": (-0.18 - max(0, -phase) * 0.25, 0, 0.035 * phase),
                "Forearm.R": (-0.27 - max(0, phase) * 0.27, 0, -0.04 * phase),
                "Hand.L": (0.04, 0.03 * phase, 0), "Hand.R": (-0.05, -0.04 * phase, 0),
            }
        else:
            base = {
                "Pelvis": (0.025, 0.025 * phase, 0.07 * phase),
                "Spine": (0.07, -0.035 * phase, -0.07 * phase),
                "Chest": (-0.04, 0.055 * phase, 0.095 * phase + 0.035),
                "Neck": (0.025, -0.035 * phase, -0.04 * phase),
                "Head": (-0.045, 0.075 * phase, 0.09 + 0.055 * phase),
                "Clavicle.L": (0, 0, 0.035 - 0.035 * phase),
                "Clavicle.R": (0, 0, -0.02 - 0.06 * phase),
                "UpperArm.L": (-arm * phase * 0.9 - 0.06, 0, 0.055),
                "UpperArm.R": (arm * phase * 1.15 - 0.10, 0, -0.035),
                "Forearm.L": (-0.15 - max(0, -phase) * 0.09, 0, 0.025),
                "Forearm.R": (-0.23 - max(0, phase) * 0.18, 0, -0.035),
                "Hand.L": (0.03, 0, 0.025 * phase), "Hand.R": (-0.06, 0, -0.04 * phase),
            }
        right_stride = stride * (0.78 if profile_name == "nurse" else 1.0)
        base.update({
            "Thigh.L": (stride * phase, 0, -0.025 * phase),
            "Thigh.R": (-right_stride * phase, 0, 0.035 * phase),
            "Shin.L": (knee * max(0, -phase), 0, 0),
            "Shin.R": (knee * 0.82 * max(0, phase), 0, 0),
            "Foot.L": (-0.22 * phase, 0, 0), "Foot.R": (0.18 * phase, 0, 0),
        })
        keys.append((frame, base, {"Pelvis": (0.018 * phase, 0, lift * (1 - abs(phase))) }))
    return keys, end


def build_actions(armature, profile_name):
    if profile_name == "gaunt":
        idle_poses = [
            (1, 0.0, 0.0), (25, 0.025, 0.025), (49, 0.0, -0.018),
            (73, -0.018, 0.012), (97, 0.0, 0.0),
        ]
        idle = []
        for frame, breath, look in idle_poses:
            idle.append((frame, {
                "Spine": (0.13 + breath, 0, look * 0.4), "Chest": (0.17 + breath * 0.7, 0, -look),
                "Neck": (-0.08, look * 0.5, 0), "Head": (-0.07 + breath, look, look * 0.5),
                "UpperArm.L": (-0.04 + breath, 0, 0.07), "UpperArm.R": (0.03 - breath, 0, -0.11),
                "Forearm.L": (-0.12, 0, 0), "Forearm.R": (-0.21, 0, 0),
            }, {"Pelvis": (0, 0, breath * 0.035)}))
    else:
        idle_poses = [
            (1, 0.0, 0.0), (25, 0.012, 0.018), (49, 0.0, -0.012),
            (65, -0.01, 0.24), (73, 0.008, -0.06), (97, 0.0, 0.0),
        ]
        idle = []
        for frame, breath, twitch in idle_poses:
            idle.append((frame, {
                "Spine": (0.045 + breath, 0, -0.025), "Chest": (-0.025, 0, 0.04),
                "Neck": (0, twitch * 0.2, 0), "Head": (-0.02 + breath, twitch * 0.35, 0.055 + twitch),
                "UpperArm.L": (-0.025, 0, 0.035), "UpperArm.R": (-0.06, 0, -0.018),
                "Forearm.L": (-0.08, 0, 0), "Forearm.R": (-0.15 - twitch * 0.1, 0, 0),
            }, {"Pelvis": (0, 0, breath * 0.02)}))
    create_action(armature, "Creature_Idle", idle, 96)
    stalk, stalk_end = locomotion_keys(profile_name, chase=False)
    chase, chase_end = locomotion_keys(profile_name, chase=True)
    create_action(armature, "Creature_Stalk", stalk, stalk_end)
    create_action(armature, "Creature_Chase", chase, chase_end)
    armature.animation_data.action = bpy.data.actions["Creature_Idle"]


def export_glb(output, mesh, armature):
    select_only(mesh, armature)
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 96
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_skins=True,
        export_all_influences=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_def_bones=False,
        export_optimize_animation_size=False,
        export_apply=False,
    )


def rig_one(project, profile_name, profile):
    clear_scene()
    asset_dir = project / "assets" / "horror"
    source = asset_dir / profile["source"]
    output = asset_dir / profile["output"]
    print(f"RIGGING {profile_name}: {source}")
    mesh = import_creature(source, profile["height"])
    armature = make_armature(profile_name, profile)
    parent_with_clean_weights(mesh, armature, profile_name)
    build_actions(armature, profile_name)
    export_glb(output, mesh, armature)
    print(f"EXPORTED {output} ({output.stat().st_size} bytes)")


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if not args:
        raise SystemExit("Pass the hide-and-seek project root after --")
    project = Path(args[0]).resolve()
    for name, profile in PROFILES.items():
        rig_one(project, name, profile)
    print("RIGGING COMPLETE")


if __name__ == "__main__":
    main()
