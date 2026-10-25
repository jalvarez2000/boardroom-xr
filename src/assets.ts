import { AssetType, defineAssets } from '@iwsdk/core';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  'controls-panel': {
    url: publicAssetUrl('ui/controls.uikitml'),
    type: AssetType.UIKitML,
    name: 'Controls Panel',
  },
});
