import { AssetType, defineAssets } from '@iwsdk/core';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  'tablet-panel': {
    url: publicAssetUrl('ui/tablet.uikitml'),
    type: AssetType.UIKitML,
    name: 'Tablet Panel',
  },
  'agent-editor-panel': {
    url: publicAssetUrl('ui/agent-editor.uikitml'),
    type: AssetType.UIKitML,
    name: 'Agent Editor Panel',
  },
  'tutorial-panel': {
    url: publicAssetUrl('ui/tutorial.uikitml'),
    type: AssetType.UIKitML,
    name: 'Tutorial Panel',
  },
  'board-bar': {
    url: publicAssetUrl('ui/board-bar.uikitml'),
    type: AssetType.UIKitML,
    name: 'Board Bar',
  },
});
