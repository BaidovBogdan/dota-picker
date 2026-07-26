import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { Image, Platform } from 'react-native';

const MAX_EDGE = 1600;

const getSize = (uri: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });

export async function prepareDraftPhoto(uri: string) {
  let preparedUri: string | null = null;
  try {
    const { width, height } = await getSize(uri);
    const longest = Math.max(width, height);
    const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
    const context = ImageManipulator.manipulate(uri);
    if (scale < 1) {
      context.resize({ width: Math.round(width * scale), height: Math.round(height * scale) });
    }
    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({
      compress: 0.78,
      format: SaveFormat.JPEG,
    });
    preparedUri = result.uri;
    return result.uri;
  } finally {
    if (preparedUri !== uri) revokeWebObjectUrl(uri);
  }
}

export function deleteDraftPhoto(uri: string | null) {
  if (!uri) return;
  if (Platform.OS === 'web') {
    revokeWebObjectUrl(uri);
    return;
  }
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {}
}

function revokeWebObjectUrl(uri: string) {
  if (Platform.OS !== 'web' || !uri.startsWith('blob:') || typeof URL === 'undefined') return;
  URL.revokeObjectURL(uri);
}
