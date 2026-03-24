/**
 * config-patcher.ts
 *
 * Patches ~/.openclaw/openclaw.json to add the vllm provider config
 * pointing at our local CLI proxy server.
 *
 * Only patches if the cli-bridge models are not already present.
 * Always backs up + validates before writing.
 */
export interface PatchResult {
    patched: boolean;
    reason: string;
}
/**
 * Ensure the vllm provider entry in openclaw.json includes CLI bridge models.
 * Returns {patched: false} if already up to date.
 */
export declare function patchOpencllawConfig(port: number): PatchResult;
//# sourceMappingURL=config-patcher.d.ts.map