import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * How tall the on-screen keyboard is right now (0 when it's closed). A
 * bottom sheet with a text box pads itself by this much so it sits above
 * the keyboard: inside a Modal, Android doesn't resize the screen for the
 * keyboard, so the sheet's lower part (a tree's name while renaming it, a
 * real, previously-shipped bug) was hidden under it.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
