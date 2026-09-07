import { Alert, Platform } from 'react-native';

/**
 * react-native-web ships Alert.alert() as a total no-op (see
 * node_modules/react-native-web/src/exports/Alert) — no dialog, no buttons,
 * no callback ever fires. On web, a "delete? [cancel/delete]" confirm using
 * Alert.alert silently does nothing at all: not even an error, the button
 * just doesn't work. These fill in with the browser's own dialogs so
 * alerts/confirmations actually happen cross-platform.
 */
export function showAlert(title: string, message?: string) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

/** Runs onConfirm only if the user actually confirms — never on web, where Alert.alert's buttons would otherwise just be dead. */
export function confirmDestructive(title: string, message: string, confirmLabel: string, cancelLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
