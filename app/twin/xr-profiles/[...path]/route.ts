// Controller layouts for @react-three/xr, served from this app so immersive VR works with no
// internet. The library fetches profilesList.json and one profile.json from baseAssetPath
// (default: a CDN) before it creates a controller's ray. We list only "generic-trigger", the
// library's fallback profile, so every controller (Quest Touch included) uses its trigger to
// click. Controller and hand models are switched off (app/twin/xr.ts), so no .glb is needed.
// Same shape as @webxr-input-profiles/assets 1.0 generic-trigger/profile.json.

function layout(handedness: "none" | "left" | "right") {
  return {
    selectComponentId: "xr-standard-trigger",
    components: {
      "xr-standard-trigger": {
        type: "trigger",
        gamepadIndices: { button: 0 },
        rootNodeName: "xr_standard_trigger",
        touchPointNodeName: "xr_standard_trigger_axes",
        visualResponses: {
          xr_standard_trigger_pressed: {
            componentProperty: "button",
            states: ["default", "touched", "pressed"],
            valueNodeProperty: "transform",
            valueNodeName: "xr_standard_trigger_pressed_value",
            minNodeName: "xr_standard_trigger_pressed_min",
            maxNodeName: "xr_standard_trigger_pressed_max",
          },
        },
      },
    },
    gamepadMapping: "xr-standard",
    rootNodeName: `generic-trigger-${handedness}`,
    assetPath: `${handedness}.glb`,
  };
}

const FILES: Record<string, unknown> = {
  "profilesList.json": {
    "generic-trigger": { path: "generic-trigger/profile.json", deprecated: false },
  },
  "generic-trigger/profile.json": {
    profileId: "generic-trigger",
    fallbackProfileIds: [],
    layouts: { none: layout("none"), left: layout("left"), right: layout("right") },
  },
};

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const body = FILES[path.join("/")];
  if (body === undefined) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
