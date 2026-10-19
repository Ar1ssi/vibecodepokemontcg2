// Design 075: the three Layers channels of the attack-FX passes. The board camera draws layer 0;
// FX objects draw on FX_LAYER; card meshes also sit on OCCLUDER_LAYER, the depth the FX "back"
// layer is tested against (only cards hide what is behind them, not the invisible pick planes).
export const FX_LAYER = 1;
export const OCCLUDER_LAYER = 2;
