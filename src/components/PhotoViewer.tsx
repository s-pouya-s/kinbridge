import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  /** Image URIs, ready for <Image> (see utils/album.ts's albumPhotoUri). */
  uris: string[];
  /** Which photo to open on; null keeps the viewer closed. */
  startIndex: number | null;
  onClose: () => void;
  closeLabel: string;
}

/**
 * A person's album, full screen on black: swipe sideways between photos, a
 * "2 / 5" counter at the top, × to close (or the back button). Paged by
 * whole screen widths, so it re-measures on rotation.
 */
export function PhotoViewer({ uris, startIndex, onClose, closeLabel }: Props) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [index, setIndex] = useState(startIndex ?? 0);
  const listRef = useRef<FlatList<string>>(null);

  useEffect(() => {
    if (startIndex != null) setIndex(startIndex);
  }, [startIndex]);

  return (
    <Modal statusBarTranslucent navigationBarTranslucent visible={startIndex != null} animationType="fade" transparent={false} onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <View style={styles.root}>
        <FlatList
          ref={listRef}
          key={window.width}
          data={uris}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.min(index, Math.max(uris.length - 1, 0))}
          getItemLayout={(_, i) => ({ length: window.width, offset: window.width * i, index: i })}
          keyExtractor={(uri, i) => `${i}-${uri.slice(-24)}`}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / window.width))}
          renderItem={({ item }) => (
            <View style={{ width: window.width, height: window.height, paddingTop: insets.top, paddingBottom: insets.bottom }}>
              <Image source={{ uri: item }} style={styles.photo} resizeMode="contain" />
            </View>
          )}
        />
        <View style={[styles.topBar, { top: insets.top + 8, left: insets.left + 12, right: insets.right + 12 }]} pointerEvents="box-none">
          <Text style={styles.counter}>{uris.length > 1 ? `${index + 1} / ${uris.length}` : ''}</Text>
          <Pressable style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]} onPress={onClose} accessibilityLabel={closeLabel} hitSlop={8}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  photo: { flex: 1, width: '100%' },
  topBar: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counter: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', opacity: 0.85 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#FFFFFF', fontSize: 24, fontWeight: '600', lineHeight: 26 },
});
