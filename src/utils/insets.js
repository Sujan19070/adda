import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Height of the system navigation bar (3-button mode) or gesture area that
// the app draws underneath, so bottom-anchored UI (message boxes, action
// bars) can pad itself clear of it.
//
// While the keyboard is open it already sits on top of the system bar, so we
// return 0 then — otherwise the input would float with an extra gap above
// the keyboard.
export function useBottomInset() {
  const insets = useSafeAreaInsets();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return keyboardOpen ? 0 : insets.bottom;
}
