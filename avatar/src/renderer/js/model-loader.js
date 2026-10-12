import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import { MMDLoader } from 'three/addons/loaders/MMDLoader.js'
import { MMDAnimationHelper } from 'three/addons/animation/MMDAnimationHelper.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'

/**
 * model-loader.js
 * Memuat model 3D ke scene three.js.
 *
 * Format yang didukung:
 *  - VRM (.vrm)  → GLTFLoader + VRMLoaderPlugin (utama)
 *  - GLB (.glb/.gltf) → GLTFLoader (fallback)
 *  - MMD (.pmx/.pmd)  → MMDLoader (via URL `model://`, butuh texture relatif)
 *  - FBX (.fbx)  → FBXLoader (via URL `model://`, butuh texture relatif)
 *
 * VRM/GLB di-load dari base64 (renderer tidak bisa fetch file lokal),
 * MMD/FBX di-load dari URL `model://` (custom protocol serve file + texture).
 */

const gltfLoader = new GLTFLoader()
gltfLoader.register((parser) => new VRMLoaderPlugin(parser))

const mmdLoader = new MMDLoader()
const fbxLoader = new FBXLoader()

/**
 * Load model VRM/GLB dari data base64 → { scene, vrm }.
 * vrm bernilai null bila model bukan VRM (mis. GLB polos).
 */
export async function loadModelFromBase64(base64, mimeType = 'model/gltf-binary') {
  const blob = base64ToBlob(base64, mimeType)
  const url = URL.createObjectURL(blob)
  try {
    const gltf = await gltfLoader.loadAsync(url)

    const vrm = gltf.userData.vrm
    if (vrm) {
      VRMUtils.removeUnnecessaryVertices(gltf.scene)
      VRMUtils.rotateVRM0(vrm)
      return { scene: gltf.scene, vrm }
    }

    return { scene: gltf.scene, vrm: null }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Load model MMD (.pmx/.pmd) dari URL `model://`.
 * MMDLoader me-resolve texture relatif ke URL, jadi harus pakai custom protocol.
 * Menyertakan MMDAnimationHelper untuk playback .vmd.
 */
export async function loadMMDModel(url) {
  const mesh = await mmdLoader.loadAsync(url)
  const helper = new MMDAnimationHelper()
  return { scene: mesh, vrm: null, mmd: { mesh, loader: mmdLoader, helper } }
}

/**
 * Load motion .vmd dari URL `model://` → AnimationClip (untuk emote).
 * Memakai loadAnimation yang membangun clip sesuai mesh.
 */
export async function loadVmdClip(url, mesh) {
  return new Promise((resolve, reject) => {
    mmdLoader.loadAnimation(url, mesh, (clip) => resolve(clip), undefined, (err) => reject(err))
  })
}

/**
 * Load animasi .glb (AnimationClip) dari URL `model://` → clips array.
 */
export async function loadGlbClip(url) {
  const gltf = await gltfLoader.loadAsync(url)
  return gltf.animations || []
}

/**
 * Load model FBX (.fbx) dari URL `model://`.
 * FBXLoader me-resolve texture relatif ke URL (custom protocol).
 */
export async function loadFBXModel(url) {
  const object = await fbxLoader.loadAsync(url)
  return { scene: object, vrm: null }
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}
