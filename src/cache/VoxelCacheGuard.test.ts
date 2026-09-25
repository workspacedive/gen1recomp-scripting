import { describe, it, expect } from "vitest"
import { validateVoxelWrite, safeVoxelPath, LIMITS } from "./VoxelCacheGuard"

describe("VoxelCacheGuard — Limits (Security)", ()=>{
  it("8MiB per file enforced", ()=>{
    expect(validateVoxelWrite({ bytes: LIMITS.MOD_CACHE_PER_FILE, totalAfter: 1000, target: "mod.cache" }).ok).toBe(true)
    expect(validateVoxelWrite({ bytes: LIMITS.MOD_CACHE_PER_FILE+1, totalAfter: 1000, target: "mod.cache" }).ok).toBe(false)
  })
  it("64MiB mod.cache total", ()=>{
    expect(validateVoxelWrite({ bytes: 1000, totalAfter: 64*1024*1024, target: "mod.cache" }).ok).toBe(true)
    expect(validateVoxelWrite({ bytes: 1000, totalAfter: 64*1024*1024+1, target: "mod.cache" }).ok).toBe(false)
  })
  it("512MiB mod.storage total", ()=>{
    expect(validateVoxelWrite({ bytes: 1000, totalAfter: 512*1024*1024, target: "mod.storage" }).ok).toBe(true)
    expect(validateVoxelWrite({ bytes: 1000, totalAfter: 512*1024*1024+1, target: "mod.storage" }).ok).toBe(false)
  })
  it("safeVoxelPath verhindert Zip Slip", ()=>{
    expect(safeVoxelPath("/library/voxel","maps/pallet.bin")).toBe("/library/voxel/maps/pallet.bin")
    expect(safeVoxelPath("/library/voxel","../etc/passwd")).toBe(null)
    expect(safeVoxelPath("/library/voxel","maps/../../escape")).toBe(null)
    expect(safeVoxelPath("/library/voxel","./maps/./pallet.bin")).toBe("/library/voxel/maps/pallet.bin")
  })
})
