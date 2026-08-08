export type OverwolfConnectPreferencesPatch = {
  assistantMode: 'overwolf';
  overwolfConsent?: {
    accepted: true;
    acceptedAt: string;
  };
};

type OverwolfConnectFlowOptions<TPreferences, TBridgeState> = {
  consentAcceptedAt?: string;
  updatePreferences: (patch: OverwolfConnectPreferencesPatch) => Promise<TPreferences>;
  setEnabled: (enabled: boolean) => Promise<unknown>;
  connect: () => Promise<TBridgeState>;
};

export async function activateOverwolfLive<TPreferences, TBridgeState>(
  options: OverwolfConnectFlowOptions<TPreferences, TBridgeState>,
) {
  const patch: OverwolfConnectPreferencesPatch = {
    assistantMode: 'overwolf',
    ...(options.consentAcceptedAt
      ? {
          overwolfConsent: {
            accepted: true,
            acceptedAt: options.consentAcceptedAt,
          },
        }
      : {}),
  };
  const preferences = await options.updatePreferences(patch);
  await options.setEnabled(true);
  const bridge = await options.connect();
  return { preferences, bridge };
}
