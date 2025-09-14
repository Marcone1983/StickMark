import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Props = { children: React.ReactNode };

type State = { hasError: boolean; message?: string };

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, message: error?.message || String(error) };
  }
  componentDidCatch(error: any) {
    console.error('[UI ERROR]', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Qualcosa è andato storto</Text>
          <Text style={styles.subtitle}>{this.state.message}</Text>
        </View>
      );
    }
    return this.props.children as any;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F14', alignItems: 'center', justifyContent: 'center', padding: 16 },
  title: { color: 'white', fontSize: 18, fontWeight: '800' },
  subtitle: { color: '#8AA2B6', marginTop: 6, textAlign: 'center' },
});