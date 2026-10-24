import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import type { WebViewErrorEvent } from "react-native-webview/lib/WebViewTypes";
import { ScreenContainer } from "@/components/screen-container";
import {
  TRACKER_INJECTION,
  displayAddress,
  normalizeDestination,
  tabTitle,
} from "@/lib/private-browser";

type BrowserTab = {
  id: string;
  url: string | null;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  error: string | null;
};

type HistoryItem = { id: string; title: string; url: string };
type BrowserWebViewRef = {
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
};

const COLORS = {
  bg: "#070609",
  panel: "#121016",
  panelRaised: "#1d1820",
  field: "#342e37",
  fieldSoft: "#26212a",
  line: "#342d38",
  text: "#fbf7ff",
  muted: "#a9a0ad",
  purple: "#7b16ff",
  purpleSoft: "#a963ff",
  pink: "#ff4b9a",
  warning: "#ffcf70",
  danger: "#ff789d",
};

const SEARCH_ENGINE = "https://www.google.com/search?q=";

function createTab(): BrowserTab {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    url: null,
    title: "Nova aba privada",
    canGoBack: false,
    canGoForward: false,
    loading: false,
    error: null,
  };
}

function searchUrl(query: string): string {
  return `${SEARCH_ENGINE}${encodeURIComponent(query.trim())}`;
}

function IconButton({
  name,
  label,
  onPress,
  disabled = false,
  accent = false,
}: {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        accent && styles.iconButtonAccent,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Ionicons
        name={name}
        size={20}
        color={disabled ? "#5c5661" : COLORS.text}
      />
    </Pressable>
  );
}

function EmptyBrowser({ onFocus }: { onFocus: () => void }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.logoOrb}>
        <View style={styles.logoOrbInner}>
          <View style={styles.logoEyeRow}>
            <View style={styles.logoEye} />
            <View style={styles.logoEye} />
          </View>
          <View style={styles.logoMouth} />
        </View>
      </View>
      <Text style={styles.emptyTitle}>Navegue sem deixar rastros</Text>
      <Text style={styles.emptyCopy}>
        Sessões descartáveis, menos persistência local e um espaço escuro para
        pesquisar com calma.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Começar a navegar"
        onPress={onFocus}
        style={({ pressed }) => [styles.startButton, pressed && styles.pressed]}
      >
        <Ionicons name="sparkles-outline" size={17} color={COLORS.text} />
        <Text style={styles.startButtonText}>Começar uma sessão</Text>
      </Pressable>
    </View>
  );
}

function WebError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.webError}>
      <Ionicons name="cloud-offline-outline" size={34} color={COLORS.muted} />
      <Text style={styles.webErrorTitle}>
        Não foi possível carregar esta página
      </Text>
      <Text style={styles.webErrorCopy}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tentar carregar novamente"
        onPress={onRetry}
        style={styles.retryButton}
      >
        <Ionicons name="refresh-outline" size={17} color={COLORS.text} />
        <Text style={styles.retryText}>Tentar novamente</Text>
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const initialTab = useMemo(() => createTab(), []);
  const [tabs, setTabs] = useState<BrowserTab[]>([initialTab]);
  const [activeTabId, setActiveTabId] = useState(initialTab.id);
  const [addressMode, setAddressMode] = useState<"search" | "url">("search");
  const [addressValue, setAddressValue] = useState("");
  const [showAddressEditor, setShowAddressEditor] = useState(false);
  const [showTabs, setShowTabs] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showPrivacyInfo, setShowPrivacyInfo] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<HistoryItem[]>([]);
  const [focused, setFocused] = useState(false);
  const [webViewVersion, setWebViewVersion] = useState<Record<string, number>>(
    {},
  );
  const [webViewRefs] = useState(() => new Map<string, BrowserWebViewRef>());
  const inputRef = useRef<TextInput>(null);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  const patchTab = useCallback((id: string, patch: Partial<BrowserTab>) => {
    setTabs((current) =>
      current.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)),
    );
  }, []);

  const addHistory = useCallback((url: string, title: string) => {
    setSessionHistory((current) =>
      [
        { id: `${Date.now()}-${url}`, url, title },
        ...current.filter((item) => item.url !== url),
      ].slice(0, 50),
    );
  }, []);

  const openDestination = useCallback(
    (destination: string) => {
      const current = tabs.find((tab) => tab.id === activeTabId);
      if (!current) return;
      setAddressValue(displayAddress(destination));
      setAddressMode("url");
      patchTab(current.id, {
        url: destination,
        title: tabTitle(destination),
        error: null,
        loading: true,
      });
      setWebViewVersion((versions) => ({
        ...versions,
        [current.id]: (versions[current.id] ?? 0) + 1,
      }));
      setShowAddressEditor(false);
      setFocused(false);
      Keyboard.dismiss();
    },
    [activeTabId, patchTab, tabs],
  );

  const submitAddress = useCallback(() => {
    const value = addressValue.trim();
    if (!value) return;
    const destination =
      addressMode === "search"
        ? searchUrl(value)
        : normalizeDestination(value, "url");
    if (!destination) {
      patchTab(activeTabId, {
        error: "Digite um endereço HTTP ou HTTPS válido.",
        loading: false,
      });
      return;
    }
    openDestination(destination);
  }, [activeTabId, addressMode, addressValue, openDestination, patchTab]);

  const handleNavigation = useCallback(
    (tabId: string, state: WebViewNavigation) => {
      const nextTitle = state.title?.trim() || tabTitle(state.url);
      patchTab(tabId, {
        url: state.url,
        title: nextTitle,
        canGoBack: state.canGoBack,
        canGoForward: state.canGoForward,
        loading: state.loading,
        error: null,
      });
      if (tabId === activeTabId) {
        setAddressMode("url");
        setAddressValue(displayAddress(state.url));
      }
      if (!state.loading && /^https?:\/\//i.test(state.url))
        addHistory(state.url, nextTitle);
    },
    [activeTabId, addHistory, patchTab],
  );

  const handleWebError = useCallback(
    (tabId: string, event: WebViewErrorEvent) => {
      const description =
        event.nativeEvent.description ||
        "A conexão foi interrompida ou o dispositivo está sem internet.";
      patchTab(tabId, { loading: false, error: description });
    },
    [patchTab],
  );

  const retryTab = useCallback(
    (tabId: string) => {
      patchTab(tabId, { error: null, loading: true });
      const webView = webViewRefs.get(tabId);
      if (webView) webView.reload();
      else
        setWebViewVersion((versions) => ({
          ...versions,
          [tabId]: (versions[tabId] ?? 0) + 1,
        }));
    },
    [patchTab, webViewRefs],
  );

  const openNewTab = useCallback(() => {
    const fresh = createTab();
    setTabs((current) => [...current, fresh]);
    setActiveTabId(fresh.id);
    setAddressMode("search");
    setAddressValue("");
    setShowTabs(false);
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      setTabs((current) => {
        if (current.length === 1) {
          const fresh = createTab();
          setActiveTabId(fresh.id);
          setAddressMode("search");
          setAddressValue("");
          return [fresh];
        }
        const remaining = current.filter((tab) => tab.id !== id);
        if (id === activeTabId) {
          const next = remaining[0];
          setActiveTabId(next.id);
          setAddressMode(next.url ? "url" : "search");
          setAddressValue(next.url ? displayAddress(next.url) : "");
        }
        return remaining;
      });
      webViewRefs.delete(id);
    },
    [activeTabId, webViewRefs],
  );

  const selectTab = useCallback((tab: BrowserTab) => {
    setActiveTabId(tab.id);
    setAddressMode(tab.url ? "url" : "search");
    setAddressValue(tab.url ? displayAddress(tab.url) : "");
    setShowTabs(false);
  }, []);

  const openHistoryItem = useCallback(
    (item: HistoryItem) => {
      setShowHistory(false);
      openDestination(item.url);
    },
    [openDestination],
  );

  const navigateBack = useCallback(
    () => webViewRefs.get(activeTabId)?.goBack(),
    [activeTabId, webViewRefs],
  );
  const navigateForward = useCallback(
    () => webViewRefs.get(activeTabId)?.goForward(),
    [activeTabId, webViewRefs],
  );
  const reload = useCallback(
    () => retryTab(activeTabId),
    [activeTabId, retryTab],
  );

  const stats = useMemo(
    () => [
      {
        icon: "layers-outline" as const,
        value: `${tabs.length}`,
        label: tabs.length === 1 ? "aba privada" : "abas privadas",
      },
      {
        icon: "shield-checkmark-outline" as const,
        value: "ativo",
        label: "rastreadores",
      },
      {
        icon: "time-outline" as const,
        value: `${sessionHistory.length}`,
        label: "itens locais",
      },
    ],
    [sessionHistory.length, tabs.length],
  );

  return (
    <ScreenContainer
      edges={["top", "left", "right", "bottom"]}
      containerClassName="bg-[#070609]"
    >
      <View style={styles.root}>
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <View style={styles.brandMarkDot} />
            </View>
            <View>
              <Text style={styles.brandName}>NOCTRA</Text>
              <Text style={styles.brandSubtitle}>PRIVATE BROWSER</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir informações de privacidade"
            onPress={() => setShowPrivacyInfo(true)}
            style={({ pressed }) => [
              styles.privateChip,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.liveDot} />
            <Text style={styles.privateChipText}>SESSÃO PRIVADA</Text>
          </Pressable>
        </View>

        <View style={[styles.addressBar, focused && styles.addressBarFocused]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Alternar modo de endereço e busca"
            onPress={() =>
              setAddressMode((mode) => (mode === "search" ? "url" : "search"))
            }
            style={styles.modeButton}
          >
            <Ionicons
              name={
                addressMode === "search" ? "search-outline" : "globe-outline"
              }
              size={18}
              color={COLORS.purpleSoft}
            />
            <Ionicons name="chevron-down" size={12} color={COLORS.muted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir campo de endereço"
            onPress={() => {
              setShowAddressEditor(true);
              setFocused(true);
            }}
            style={styles.addressInput}
          >
            <Text
              numberOfLines={1}
              style={
                addressValue ? styles.addressValue : styles.addressPlaceholder
              }
            >
              {addressValue ||
                (addressMode === "search"
                  ? "Pesquisar com privacidade"
                  : "https://endereco.com")}
            </Text>
          </Pressable>
          {!!addressValue && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Limpar endereço"
              onPress={() => setAddressValue("")}
              style={styles.clearButton}
            >
              <Ionicons name="close-circle" size={18} color={COLORS.muted} />
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir endereço"
            onPress={submitAddress}
            style={({ pressed }) => [
              styles.goButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="arrow-up" size={18} color={COLORS.text} />
          </Pressable>
        </View>

        <Modal
          visible={showAddressEditor}
          animationType="slide"
          onRequestClose={() => {
            Keyboard.dismiss();
            setShowAddressEditor(false);
            setFocused(false);
          }}
          onShow={() => setTimeout(() => inputRef.current?.focus(), 120)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.editorRoot}
          >
            <View style={styles.editorHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fechar endereço"
                onPress={() => {
                  Keyboard.dismiss();
                  setShowAddressEditor(false);
                  setFocused(false);
                }}
                style={styles.editorClose}
              >
                <Ionicons name="close" size={23} color={COLORS.text} />
              </Pressable>
              <Text style={styles.editorTitle}>
                {addressMode === "search" ? "Pesquisar" : "Abrir endereço"}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Enviar endereço"
                onPress={submitAddress}
                style={styles.editorGo}
              >
                <Ionicons name="arrow-up" size={19} color={COLORS.text} />
              </Pressable>
            </View>
            <View style={styles.editorField}>
              <Ionicons
                name={
                  addressMode === "search" ? "search-outline" : "globe-outline"
                }
                size={20}
                color={COLORS.purpleSoft}
              />
              <TextInput
                ref={inputRef}
                accessibilityLabel={
                  addressMode === "search"
                    ? "Pesquisar na web"
                    : "Endereço da página"
                }
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                blurOnSubmit={false}
                keyboardType="url"
                returnKeyType="go"
                selectionColor={COLORS.pink}
                style={styles.editorInput}
                value={addressValue}
                onChangeText={setAddressValue}
                onSubmitEditing={submitAddress}
                placeholder={
                  addressMode === "search"
                    ? "O que você quer encontrar?"
                    : "https://endereco.com"
                }
                placeholderTextColor={COLORS.muted}
              />
            </View>
            <Text style={styles.editorHint}>
              {addressMode === "search"
                ? "A pesquisa abre diretamente no navegador, sem uma tela intermediária."
                : "O endereço será aberto em uma aba privada real."}
            </Text>
          </KeyboardAvoidingView>
        </Modal>

        <View style={styles.statusRow}>
          <View style={styles.statusLeft}>
            <Ionicons
              name="shield-checkmark"
              size={15}
              color={COLORS.purpleSoft}
            />
            <Text style={styles.statusText}>proteção local ativa</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Alternar modo de busca e URL"
            onPress={() =>
              setAddressMode((mode) => (mode === "search" ? "url" : "search"))
            }
            style={styles.modeHint}
          >
            <Text style={styles.modeHintText}>
              {addressMode === "search" ? "BUSCA" : "URL"}
            </Text>
            <Ionicons name="swap-vertical" size={13} color={COLORS.pink} />
          </Pressable>
        </View>

        <View style={styles.content}>
          {!activeTab.url ? (
            <EmptyBrowser
              onFocus={() => {
                setShowAddressEditor(true);
                setFocused(true);
              }}
            />
          ) : (
            <View style={styles.webFrame}>
              {activeTab.loading && <View style={styles.progressLine} />}
              {tabs.map((tab) =>
                tab.url ? (
                  <View
                    key={`${tab.id}-${webViewVersion[tab.id] ?? 0}`}
                    style={[
                      styles.webViewLayer,
                      tab.id !== activeTabId && styles.hiddenWebView,
                    ]}
                    pointerEvents={tab.id === activeTabId ? "auto" : "none"}
                  >
                    <WebView
                      ref={(ref) => {
                        if (ref) webViewRefs.set(tab.id, ref);
                        else webViewRefs.delete(tab.id);
                      }}
                      source={{ uri: tab.url }}
                      incognito
                      cacheEnabled={false}
                      sharedCookiesEnabled={false}
                      thirdPartyCookiesEnabled={false}
                      javaScriptEnabled
                      domStorageEnabled
                      setSupportMultipleWindows={false}
                      startInLoadingState
                      allowsBackForwardNavigationGestures
                      originWhitelist={["http://*", "https://*"]}
                      injectedJavaScript={TRACKER_INJECTION}
                      onNavigationStateChange={(state) =>
                        handleNavigation(tab.id, state)
                      }
                      onError={(event) => handleWebError(tab.id, event)}
                      onHttpError={(event) =>
                        patchTab(tab.id, {
                          error: `Servidor respondeu com HTTP ${event.nativeEvent.statusCode}.`,
                          loading: false,
                        })
                      }
                      onLoadStart={() =>
                        patchTab(tab.id, { loading: true, error: null })
                      }
                      onLoadEnd={() => patchTab(tab.id, { loading: false })}
                      style={styles.webView}
                    />
                    {tab.error && (
                      <WebError
                        message={tab.error}
                        onRetry={() => retryTab(tab.id)}
                      />
                    )}
                  </View>
                ) : null,
              )}
            </View>
          )}
        </View>

        <View style={styles.statsRow}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.statItem}>
              <Ionicons name={stat.icon} size={15} color={COLORS.muted} />
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.bottomBar}>
          <IconButton
            name="chevron-back"
            label="Voltar na página"
            disabled={!activeTab.canGoBack}
            onPress={navigateBack}
          />
          <IconButton
            name="chevron-forward"
            label="Avançar na página"
            disabled={!activeTab.canGoForward}
            onPress={navigateForward}
          />
          <IconButton
            name="refresh-outline"
            label="Recarregar página"
            disabled={!activeTab.url}
            onPress={reload}
          />
          <IconButton
            name="time-outline"
            label="Abrir histórico da sessão"
            onPress={() => setShowHistory(true)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Abrir abas privadas, ${tabs.length} abertas`}
            onPress={() => setShowTabs(true)}
            style={({ pressed }) => [
              styles.tabsButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="copy-outline" size={19} color={COLORS.text} />
            <Text style={styles.tabsCount}>{tabs.length}</Text>
          </Pressable>
          <IconButton
            name="add"
            label="Nova aba privada"
            accent
            onPress={openNewTab}
          />
        </View>
        <Text style={styles.disclaimer}>
          O Noctra usa abas privadas e armazenamento reduzido. O anonimato em
          nível Tor requer uma rede ou proxy Tor real.
        </Text>
      </View>

      <Modal
        visible={showTabs}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTabs(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowTabs(false)}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetEyebrow}>ESPAÇO DESCARTÁVEL</Text>
                <Text style={styles.sheetTitle}>Abas privadas</Text>
              </View>
              <IconButton
                name="close"
                label="Fechar painel de abas"
                onPress={() => setShowTabs(false)}
              />
            </View>
            <ScrollView contentContainerStyle={styles.sheetList}>
              {tabs.map((tab, index) => (
                <Pressable
                  key={tab.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Selecionar ${tab.title}`}
                  onPress={() => selectTab(tab)}
                  style={({ pressed }) => [
                    styles.tabCard,
                    tab.id === activeTabId && styles.tabCardActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.tabCardIcon}>
                    <Ionicons
                      name={tab.url ? "globe-outline" : "sparkles-outline"}
                      size={19}
                      color={COLORS.purpleSoft}
                    />
                  </View>
                  <View style={styles.tabCardBody}>
                    <Text numberOfLines={1} style={styles.tabCardTitle}>
                      {tab.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.tabCardUrl}>
                      {tab.url
                        ? displayAddress(tab.url)
                        : "Pronta para pesquisar"}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Fechar aba ${index + 1}`}
                    hitSlop={8}
                    onPress={() => closeTab(tab.id)}
                    style={styles.tabClose}
                  >
                    <Ionicons name="close" size={18} color={COLORS.muted} />
                  </Pressable>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Abrir nova aba privada"
              onPress={openNewTab}
              style={styles.sheetAction}
            >
              <Ionicons
                name="add-circle-outline"
                size={20}
                color={COLORS.text}
              />
              <Text style={styles.sheetActionText}>Nova aba privada</Text>
            </Pressable>
            <Text style={styles.sheetFootnote}>
              Fechar uma aba desmonta sua sessão e descarta seus dados locais.
            </Text>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showHistory}
        transparent
        animationType="slide"
        onRequestClose={() => setShowHistory(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowHistory(false)}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetEyebrow}>SOMENTE NESTA SESSÃO</Text>
                <Text style={styles.sheetTitle}>Histórico privado</Text>
              </View>
              <IconButton
                name="close"
                label="Fechar histórico"
                onPress={() => setShowHistory(false)}
              />
            </View>
            {sessionHistory.length === 0 ? (
              <View style={styles.historyEmpty}>
                <Ionicons
                  name="footsteps-outline"
                  size={30}
                  color={COLORS.muted}
                />
                <Text style={styles.historyEmptyTitle}>
                  Nenhum rastro ainda
                </Text>
                <Text style={styles.historyEmptyCopy}>
                  Suas páginas aparecem aqui apenas enquanto esta sessão estiver
                  aberta.
                </Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.sheetList}>
                {sessionHistory.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => openHistoryItem(item)}
                    style={styles.historyRow}
                  >
                    <Ionicons
                      name="globe-outline"
                      size={18}
                      color={COLORS.purpleSoft}
                    />
                    <View style={styles.historyBody}>
                      <Text numberOfLines={1} style={styles.historyTitle}>
                        {item.title}
                      </Text>
                      <Text numberOfLines={1} style={styles.historyUrl}>
                        {displayAddress(item.url)}
                      </Text>
                    </View>
                    <Ionicons
                      name="arrow-forward"
                      size={17}
                      color={COLORS.muted}
                    />
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Apagar histórico da sessão"
              onPress={() => setSessionHistory([])}
              style={styles.clearHistoryButton}
            >
              <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
              <Text style={styles.clearHistoryText}>
                Apagar histórico desta sessão
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showPrivacyInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPrivacyInfo(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowPrivacyInfo(false)}
          />
          <View style={styles.infoCard}>
            <View style={styles.infoIcon}>
              <Ionicons name="shield-checkmark" size={24} color={COLORS.text} />
            </View>
            <Text style={styles.sheetEyebrow}>TRANSPARÊNCIA PRIMEIRO</Text>
            <Text style={styles.infoTitle}>O que o Noctra protege</Text>
            <Text style={styles.infoCopy}>
              Cada aba usa uma sessão WebView privada, sem cookies
              compartilhados, sem cache persistente e com bloqueio básico de
              endpoints conhecidos de rastreamento.
            </Text>
            <Text style={styles.infoCopy}>
              O Noctra não roteia tráfego pela rede Tor. Para anonimato em nível
              Tor, é necessária uma integração real com proxy ou rede Tor.
            </Text>
            <Pressable
              onPress={() => setShowPrivacyInfo(false)}
              style={styles.infoButton}
            >
              <Text style={styles.infoButtonText}>Entendi</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowPrivacyInfo(false);
                Linking.openURL("https://support.torproject.org/");
              }}
              style={styles.infoLink}
            >
              <Text style={styles.infoLinkText}>Saiba mais sobre Tor</Text>
              <Ionicons name="open-outline" size={15} color={COLORS.pink} />
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  brandRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  brandMark: {
    alignItems: "center",
    backgroundColor: COLORS.purple,
    borderColor: COLORS.pink,
    borderRadius: 15,
    borderWidth: 2,
    height: 30,
    justifyContent: "center",
    shadowColor: COLORS.pink,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    width: 30,
  },
  brandMarkDot: {
    backgroundColor: COLORS.text,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  brandName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 2.2,
  },
  brandSubtitle: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.7,
    marginTop: 2,
  },
  privateChip: {
    alignItems: "center",
    backgroundColor: "#19131d",
    borderColor: COLORS.line,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  liveDot: {
    backgroundColor: COLORS.pink,
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  privateChipText: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  addressBar: {
    alignItems: "center",
    backgroundColor: COLORS.field,
    borderColor: COLORS.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 54,
    paddingHorizontal: 7,
  },
  addressBarFocused: {
    borderColor: COLORS.purpleSoft,
    shadowColor: COLORS.purple,
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  modeButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    padding: 10,
  },
  addressInput: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
    paddingHorizontal: 4,
  },
  addressPlaceholder: { color: COLORS.muted, fontSize: 14 },
  addressValue: { color: COLORS.text, fontSize: 14 },
  clearButton: { padding: 7 },
  goButton: {
    alignItems: "center",
    backgroundColor: COLORS.purple,
    borderRadius: 14,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    marginTop: 12,
  },
  statusLeft: { alignItems: "center", flexDirection: "row", gap: 7 },
  statusText: { color: COLORS.muted, fontSize: 11 },
  modeHint: { alignItems: "center", flexDirection: "row", gap: 4 },
  modeHintText: {
    color: COLORS.pink,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  content: { flex: 1, minHeight: 0 },
  emptyState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  logoOrb: {
    alignItems: "center",
    backgroundColor: COLORS.purple,
    borderColor: COLORS.pink,
    borderRadius: 42,
    borderWidth: 2,
    height: 84,
    justifyContent: "center",
    shadowColor: COLORS.pink,
    shadowOpacity: 0.4,
    shadowRadius: 24,
    width: 84,
  },
  logoOrbInner: {
    alignItems: "center",
    backgroundColor: "#190d27",
    borderRadius: 30,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  logoEyeRow: { flexDirection: "row", gap: 13 },
  logoEye: {
    backgroundColor: COLORS.text,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  logoMouth: {
    backgroundColor: COLORS.pink,
    borderRadius: 3,
    height: 3,
    marginTop: 9,
    width: 17,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 23,
    fontWeight: "800",
    marginTop: 24,
    textAlign: "center",
  },
  emptyCopy: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
    maxWidth: 320,
    textAlign: "center",
  },
  startButton: {
    alignItems: "center",
    backgroundColor: COLORS.purple,
    borderRadius: 15,
    flexDirection: "row",
    gap: 9,
    marginTop: 24,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  startButtonText: { color: COLORS.text, fontSize: 14, fontWeight: "800" },
  webFrame: {
    backgroundColor: "#fff",
    borderColor: COLORS.line,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    overflow: "hidden",
  },
  webViewLayer: {
    backgroundColor: "#fff",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  hiddenWebView: { opacity: 0 },
  webView: { flex: 1 },
  progressLine: {
    backgroundColor: COLORS.pink,
    height: 3,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 2,
  },
  webError: {
    alignItems: "center",
    backgroundColor: COLORS.panel,
    bottom: 0,
    justifyContent: "center",
    left: 0,
    padding: 24,
    position: "absolute",
    right: 0,
    top: 0,
  },
  webErrorTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 14,
    textAlign: "center",
  },
  webErrorCopy: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    textAlign: "center",
  },
  retryButton: {
    alignItems: "center",
    backgroundColor: COLORS.purple,
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    marginTop: 18,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  retryText: { color: COLORS.text, fontSize: 13, fontWeight: "800" },
  statsRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
  },
  statItem: { alignItems: "center", flexDirection: "row", gap: 5 },
  statValue: { color: COLORS.text, fontSize: 12, fontWeight: "800" },
  statLabel: { color: COLORS.muted, fontSize: 10 },
  bottomBar: {
    alignItems: "center",
    backgroundColor: COLORS.panel,
    borderColor: COLORS.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 5,
    paddingVertical: 5,
  },
  iconButton: {
    alignItems: "center",
    borderRadius: 13,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  iconButtonAccent: { backgroundColor: COLORS.purple },
  tabsButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    paddingHorizontal: 7,
  },
  tabsCount: { color: COLORS.text, fontSize: 12, fontWeight: "800" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  disclaimer: {
    color: "#77707d",
    fontSize: 9,
    lineHeight: 13,
    paddingBottom: 5,
    paddingTop: 8,
    textAlign: "center",
  },
  editorRoot: {
    backgroundColor: COLORS.bg,
    flex: 1,
    padding: 20,
    paddingTop: 60,
  },
  editorHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  editorClose: { padding: 6 },
  editorGo: {
    alignItems: "center",
    backgroundColor: COLORS.purple,
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  editorTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800" },
  editorField: {
    alignItems: "center",
    backgroundColor: COLORS.field,
    borderColor: COLORS.purpleSoft,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 28,
    paddingHorizontal: 14,
  },
  editorInput: {
    color: COLORS.text,
    flex: 1,
    fontSize: 16,
    height: 54,
    marginLeft: 10,
  },
  editorHint: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },
  modalBackdrop: {
    backgroundColor: "rgba(0,0,0,0.68)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.panel,
    borderColor: COLORS.line,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    maxHeight: "82%",
    padding: 18,
  },
  sheetHandle: {
    alignSelf: "center",
    backgroundColor: COLORS.line,
    borderRadius: 3,
    height: 5,
    marginBottom: 16,
    width: 42,
  },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sheetEyebrow: {
    color: COLORS.pink,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  sheetTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 3,
  },
  sheetList: { gap: 10, paddingVertical: 18 },
  tabCard: {
    alignItems: "center",
    backgroundColor: COLORS.panelRaised,
    borderColor: COLORS.line,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    padding: 12,
  },
  tabCardActive: { borderColor: COLORS.purpleSoft },
  tabCardIcon: {
    alignItems: "center",
    backgroundColor: COLORS.fieldSoft,
    borderRadius: 11,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  tabCardBody: { flex: 1, marginLeft: 11, minWidth: 0 },
  tabCardTitle: { color: COLORS.text, fontSize: 13, fontWeight: "800" },
  tabCardUrl: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  tabClose: { padding: 6 },
  sheetAction: {
    alignItems: "center",
    backgroundColor: COLORS.purple,
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 13,
  },
  sheetActionText: { color: COLORS.text, fontSize: 13, fontWeight: "800" },
  sheetFootnote: {
    color: COLORS.muted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 12,
    textAlign: "center",
  },
  historyEmpty: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 35,
  },
  historyEmptyTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 12,
  },
  historyEmptyCopy: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
    textAlign: "center",
  },
  historyRow: {
    alignItems: "center",
    backgroundColor: COLORS.panelRaised,
    borderRadius: 12,
    flexDirection: "row",
    padding: 12,
  },
  historyBody: { flex: 1, marginHorizontal: 10, minWidth: 0 },
  historyTitle: { color: COLORS.text, fontSize: 13, fontWeight: "700" },
  historyUrl: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  clearHistoryButton: {
    alignItems: "center",
    borderColor: "#51303e",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 11,
  },
  clearHistoryText: { color: COLORS.danger, fontSize: 12, fontWeight: "700" },
  infoCard: {
    backgroundColor: COLORS.panel,
    borderColor: COLORS.line,
    borderRadius: 22,
    margin: 20,
    padding: 20,
  },
  infoIcon: {
    alignItems: "center",
    backgroundColor: COLORS.purple,
    borderRadius: 15,
    height: 46,
    justifyContent: "center",
    marginBottom: 16,
    width: 46,
  },
  infoTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 5,
  },
  infoCopy: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
  },
  infoButton: {
    alignItems: "center",
    backgroundColor: COLORS.purple,
    borderRadius: 13,
    marginTop: 18,
    paddingVertical: 13,
  },
  infoButtonText: { color: COLORS.text, fontSize: 13, fontWeight: "800" },
  infoLink: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    marginTop: 15,
  },
  infoLinkText: { color: COLORS.pink, fontSize: 12, fontWeight: "700" },
});
