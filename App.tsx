import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from "react-native-safe-area-context"
import HomeScreen from "./screens/HomeScreen"
import UploadStickerScreen from "./screens/UploadStickerScreen"
import MintScreen from "./screens/MintScreen"
import MarketplaceScreen from "./screens/MarketplaceScreen"
import NftDetailScreen from "./screens/NftDetailScreen"
import ConnectWalletScreen from "./screens/ConnectWalletScreen"
import SplashScreen from "./screens/SplashScreen";
import { ConvexProvider, ConvexReactClient } from 'convex/react';

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL || 'https://agreeable-meadowlark-896.convex.cloud');

const Stack = createNativeStackNavigator();

function RootStack() {
  return (
    <Stack.Navigator screenOptions={{
      headerShown: false
    }} initialRouteName="Splash">
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="UploadSticker" component={UploadStickerScreen} />
      <Stack.Screen name="CreateSticker" component={require('./screens/CreateStickerScreen').default} />
      <Stack.Screen name="Mint" component={MintScreen} />
      <Stack.Screen name="Marketplace" component={MarketplaceScreen} />
      <Stack.Screen name="NftDetail" component={NftDetailScreen} />
      <Stack.Screen name="ConnectWallet" component={ConnectWalletScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider style={styles.container}>
      <ConvexProvider client={convex}>
        <NavigationContainer>
          <RootStack />
        </NavigationContainer>
      </ConvexProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    userSelect: "none"
  }
});