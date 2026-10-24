import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Keyboard,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import {
  displayAddress,
  normalizeDestination,
  tabTitle,
  type AddressMode,
} from "@/lib/private-browser";

// react-native-webview 14 exposes a legacy generic component signature that
// resolves to `never` with the React 19 types bundled by Expo 57.
type BrowserTab = {
  id: string;
  url: string | null;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
};

type SessionHistoryItem = {
  id: string;
  title: string;
  url: string;
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

function newTab(): BrowserTab {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    url: null,
    title: "Nova aba privada",
    canGoBack: false,
    canGoForward: false,
  };
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
      <Ionicons name={name} size={20} color={disabled ? "#5c5661" : COLORS.text} />
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
        Sessões descartáveis, menos persistência local e um espaço escuro para pesquisar com calma.
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

type SearchResult = {
  title: string;
  url: string;
  description: string;
};

type NativePageLink = {
  label: string;
  url: string;
};

type NativePageData = {
  title: string;
  description: string;
  paragraphs: string[];
  links: NativePageLink[];
};

function cleanPageText(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNativePage(html: string, sourceUrl: string): NativePageData {
  const title = cleanPageText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "Página sem título") || "Página sem título";
  const description = cleanPageText(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] || "");
  const blocks = [...html.matchAll(/<(?:p|h1|h2|h3|article|section|li)[^>]*>([\s\S]*?)<\/(?:p|h1|h2|h3|article|section|li)>/gi)]
    .map((match) => cleanPageText(match[1]))
    .filter((text) => text.length > 35)
    .filter((text, index, all) => all.indexOf(text) === index)
    .slice(0, 40);
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ label: cleanPageText(match[2]), url: match[1] }))
    .filter((link) => link.label.length > 1 && !link.url.startsWith("#"))
    .map((link) => ({ ...link, url: new URL(link.url, sourceUrl).toString() }))
    .filter((link, index, all) => all.findIndex((item) => item.url === link.url) === index)
    .slice(0, 16);
  return { title, description, paragraphs: blocks, links };
}

function NativePageSurface({
  url,
  onLoadStart,
  onLoadEnd,
  onError,
  onOpenLink,
}: {
  url: string;
  onLoadStart: () => void;
  onLoadEnd: (data: NativePageData) => void;
  onError: () => void;
  onOpenLink: (url: string) => void;
}) {
  const [page, setPage] = useState<NativePageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    onLoadStart();
    fetch(url, { headers: { Accept: "text/html,application/xhtml+xml" } })
      .then((response) => {
        if (!response.ok) throw new Error("page unavailable");
        return response.text();
      })
      .then((html) => {
        if (cancelled) return;
        const data = parseNativePage(html, url);
        setPage(data);
        setIsLoading(false);
        onLoadEnd(data);
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoading(false);
          onError();
        }
      });
    return () => { cancelled = true; };
  }, [onError, onLoadEnd, onLoadStart, url]);

  if (isLoading) return <View style={styles.searchState}><View style={styles.loadingDot} /><Text style={styles.searchStateTitle}>Preparando uma leitura limpa</Text><Text style={styles.searchStateCopy}>O Noctra está reconstruindo esta página com elementos nativos.</Text></View>;
  if (!page) return null;

  return <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
    <View style={styles.pageHeader}><Text style={styles.pageEyebrow}>LEITURA NATIVA</Text><Text style={styles.pageTitle}>{page.title}</Text><Text style={styles.pageDomain}>{new URL(url).hostname}</Text>{page.description ? <Text style={styles.pageLead}>{page.description}</Text> : null}</View>
    {page.paragraphs.length ? page.paragraphs.map((paragraph, index) => <Text key={`${paragraph.slice(0, 20)}-${index}`} style={styles.pageParagraph}>{paragraph}</Text>) : <Text style={styles.pageParagraph}>Esta página não entregou texto legível para o modo nativo.</Text>}
    {page.links.length ? <View style={styles.nativeLinks}><Text style={styles.linksTitle}>Links desta página</Text>{page.links.map((link, index) => <Pressable key={`${link.url}-${index}`} onPress={() => onOpenLink(link.url)} style={({ pressed }) => [styles.nativeLink, pressed && styles.pressed]}><Ionicons name="link-outline" size={16} color={COLORS.purpleSoft} /><Text numberOfLines={2} style={styles.nativeLinkText}>{link.label}</Text><Ionicons name="chevron-forward" size={15} color={COLORS.muted} /></Pressable>)}</View> : null}
  </ScrollView>;
}

function NativeSearchSurface({
  query,
  onOpenResult,
}: {
  query: string;
  onOpenResult: (url: string, title: string) => void;
}) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`)
      .then((response) => {
        if (!response.ok) throw new Error("search failed");
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        const next: SearchResult[] = [];
        const collect = (items: unknown[]) => {
          items.forEach((item) => {
            if (!item || typeof item !== "object") return;
            const value = item as { FirstURL?: string; Text?: string; Topics?: unknown[] };
            if (value.FirstURL && value.Text) {
              next.push({ title: value.Text.split(" - ")[0], url: value.FirstURL, description: value.Text });
            }
            if (Array.isArray(value.Topics)) collect(value.Topics);
          });
        };
        collect(Array.isArray(payload.RelatedTopics) ? payload.RelatedTopics : []);
        if (payload.AbstractURL && payload.AbstractText) {
          next.unshift({ title: payload.Heading || query, url: payload.AbstractURL, description: payload.AbstractText });
        }
        setResults(next.slice(0, 12));
        setIsSearching(false);
      })
      .catch(() => {
        if (!cancelled) {
          setHasError(true);
          setIsSearching(false);
        }
      });
    return () => { cancelled = true; };
  }, [query]);

  if (isSearching) {
    return <View style={styles.searchState}><View style={styles.loadingDot} /><Text style={styles.searchStateTitle}>Procurando com cuidado</Text><Text style={styles.searchStateCopy}>Os resultados aparecem aqui, sem abrir outro site.</Text></View>;
  }

  if (hasError) {
    return <View style={styles.searchState}><Ionicons name="cloud-offline-outline" size={32} color={COLORS.muted} /><Text style={styles.searchStateTitle}>A busca não respondeu</Text><Text style={styles.searchStateCopy}>Confira sua conexão e tente pesquisar novamente.</Text></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.resultsContent} showsVerticalScrollIndicator={false}>
      <View style={styles.resultsHeader}><Text style={styles.resultsEyebrow}>RESULTADOS PRIVADOS</Text><Text style={styles.resultsTitle}>Sobre “{query}”</Text><Text style={styles.resultsMeta}>{results.length ? `${results.length} descobertas para você` : "Ainda não encontrei uma resposta direta"}</Text></View>
      {results.length ? results.map((result, index) => (
        <Pressable key={`${result.url}-${index}`} accessibilityRole="button" accessibilityLabel={`Abrir ${result.title}`} onPress={() => onOpenResult(result.url, result.title)} style={({ pressed }) => [styles.resultCard, pressed && styles.pressed]}>
          <View style={styles.resultIcon}><Ionicons name="arrow-up-right-box" size={17} color={COLORS.purpleSoft} /></View>
          <View style={styles.resultBody}><Text numberOfLines={2} style={styles.resultTitle}>{result.title}</Text><Text numberOfLines={1} style={styles.resultUrl}>{result.url.replace(/^https?:\/\//, "").split("/")[0]}</Text><Text numberOfLines={2} style={styles.resultDescription}>{result.description}</Text></View>
        </Pressable>
      )) : <View style={styles.noResults}><Ionicons name="search-outline" size={28} color={COLORS.muted} /><Text style={styles.searchStateTitle}>Nada apareceu por enquanto</Text><Text style={styles.searchStateCopy}>Tente palavras mais específicas ou digite um endereço completo.</Text></View>}
    </ScrollView>
  );
}

export default function HomeScreen() {
  const initialTab = useMemo(() => newTab(), []);
  const [tabs, setTabs] = useState<BrowserTab[]>([initialTab]);
  const [activeTabId, setActiveTabId] = useState<string>(initialTab.id);
  const [addressMode, setAddressMode] = useState<AddressMode>("search");
  const [addressValue, setAddressValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showTabs, setShowTabs] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showPrivacyInfo, setShowPrivacyInfo] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([]);
  const [pageError, setPageError] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [pageVersion, setPageVersion] = useState(0);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  const updateActiveTab = useCallback((patch: Partial<BrowserTab>) => {
    setTabs((current) => current.map((tab) => (tab.id === activeTabId ? { ...tab, ...patch } : tab)));
  }, [activeTabId]);

  const submitAddress = useCallback(() => {
    if (addressMode === "search") {
      const query = addressValue.trim();
      if (!query) { setPageError(true); return; }
      Keyboard.dismiss();
      setIsFocused(false);
      setPageError(false);
      setSearchQuery(query);
      setSessionHistory((current) => [{ id: `${Date.now()}-${query}`, title: query, url: `noctra://search/${encodeURIComponent(query)}` }, ...current.filter((entry) => entry.title !== query)].slice(0, 30));
      return;
    }
    const destination = normalizeDestination(addressValue, addressMode);
    if (!destination) {
      setPageError(true);
      return;
    }
    Keyboard.dismiss();
    setIsFocused(false);
    setPageError(false);
    updateActiveTab({ url: destination, title: tabTitle(destination) });
  }, [addressMode, addressValue, updateActiveTab]);

  const openSearchResult = useCallback((url: string, title: string) => {
    setSearchQuery(null);
    setAddressMode("url");
    setAddressValue(displayAddress(url));
    updateActiveTab({ url, title });
  }, [updateActiveTab]);

  const openNativeLink = useCallback((url: string) => {
    setPageError(false);
    setAddressMode("url");
    setAddressValue(displayAddress(url));
    updateActiveTab({ url, title: tabTitle(url) });
  }, [updateActiveTab]);

  const handleNativePageLoaded = useCallback((data: NativePageData) => {
    setIsLoading(false);
    updateActiveTab({ title: data.title });
    setPageError(false);
  }, [updateActiveTab]);

  const handleNativePageStart = useCallback(() => {
    setIsLoading(true);
    setPageError(false);
  }, []);

  const handleNativePageError = useCallback(() => {
    setIsLoading(false);
    setPageError(true);
  }, []);

  const openNewTab = useCallback(() => {
    const fresh = newTab();
    setTabs((current) => [...current, fresh]);
    setActiveTabId(fresh.id);
    setShowTabs(false);
    setAddressMode("search");
    setAddressValue("");
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((current) => {
      if (current.length === 1) {
        const fresh = newTab();
        setActiveTabId(fresh.id);
        setAddressMode("search");
        setAddressValue("");
        return [fresh];
      }
      const next = current.filter((tab) => tab.id !== id);
      if (id === activeTabId) {
        setActiveTabId(next[0].id);
        setAddressMode(next[0].url ? "url" : "search");
        setAddressValue(next[0].url ? displayAddress(next[0].url) : "");
      }
      return next;
    });
    setSessionHistory([]);
  }, [activeTabId]);

  const openHistoryItem = useCallback((url: string) => {
    if (url.startsWith("noctra://search/")) {
      setSearchQuery(displayAddress(url));
      setAddressMode("search");
      setAddressValue(displayAddress(url));
      setShowHistory(false);
      return;
    }
    setAddressMode("url");
    setAddressValue(url);
    setShowHistory(false);
    setPageError(false);
    updateActiveTab({ url, title: tabTitle(url) });
  }, [updateActiveTab]);

  const privacyStats = useMemo(
    () => [
      { icon: "layers-outline" as const, value: `${tabs.length}`, label: "aba privada" },
      { icon: "shield-checkmark-outline" as const, value: "ativo", label: "rastreadores" },
      { icon: "time-outline" as const, value: `${sessionHistory.length}`, label: "itens locais" },
    ],
    [sessionHistory.length, tabs.length],
  );

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]} containerClassName="bg-[#070609]">
      <View style={styles.root}>
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><View style={styles.brandMarkDot} /></View>
            <View><Text style={styles.brandName}>NOCTRA</Text><Text style={styles.brandSubtitle}>PRIVATE BROWSER</Text></View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir informações de privacidade" onPress={() => setShowPrivacyInfo(true)} style={({ pressed }) => [styles.privateChip, pressed && styles.pressed]}>
            <View style={styles.liveDot} /><Text style={styles.privateChipText}>SESSÃO PRIVADA</Text>
          </Pressable>
        </View>

        <View style={[styles.addressBar, isFocused && styles.addressBarFocused]}>
          <Pressable accessibilityRole="button" accessibilityLabel={addressMode === "search" ? "Modo de pesquisa" : "Modo de endereço"} onPress={() => setAddressMode((current) => current === "search" ? "url" : "search")} style={styles.modeButton}>
            <Ionicons name={addressMode === "search" ? "search-outline" : "globe-outline"} size={18} color={COLORS.purpleSoft} /><Ionicons name="chevron-down" size={12} color={COLORS.muted} />
          </Pressable>
          <TextInput
            accessibilityLabel={addressMode === "search" ? "Pesquisar na web" : "Endereço da página"}
            autoCapitalize="none" autoCorrect={false} blurOnSubmit={false} keyboardType="url"
            onBlur={() => setIsFocused(false)} onChangeText={setAddressValue} onFocus={() => setIsFocused(true)} onSubmitEditing={submitAddress}
            placeholder={addressMode === "search" ? "Pesquisar com privacidade" : "https://endereco.com"} placeholderTextColor={COLORS.muted}
            returnKeyType="go" selectionColor={COLORS.pink} style={styles.addressInput} value={addressValue}
          />
          {!!addressValue && <Pressable accessibilityLabel="Limpar campo de endereço" onPress={() => setAddressValue("")} style={styles.clearButton}><Ionicons name="close-circle" size={18} color={COLORS.muted} /></Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir endereço" onPress={submitAddress} style={({ pressed }) => [styles.goButton, pressed && styles.pressed]}><Ionicons name="arrow-up" size={18} color={COLORS.text} /></Pressable>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.statusLeft}><Ionicons name="shield-checkmark" size={15} color={COLORS.purpleSoft} /><Text style={styles.statusText}>proteção local ativa</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Alternar modo de busca e URL" onPress={() => setAddressMode((current) => current === "search" ? "url" : "search")} style={styles.modeHint}><Text style={styles.modeHintText}>{addressMode === "search" ? "BUSCA" : "URL"}</Text><Ionicons name="swap-vertical" size={13} color={COLORS.pink} /></Pressable>
        </View>

        <View style={styles.content}>
          {searchQuery ? <NativeSearchSurface key={searchQuery} query={searchQuery} onOpenResult={openSearchResult} /> : activeTab.url ? (
            <View style={styles.browserFrame}>
              {isLoading && <View style={styles.progressLine} />}
              <NativePageSurface
                key={`${activeTab.url}-${pageVersion}`}
                url={activeTab.url}
                onLoadStart={handleNativePageStart}
                onLoadEnd={handleNativePageLoaded} onError={handleNativePageError}
                onOpenLink={openNativeLink}
              />
              {pageError && <View style={styles.inlineError}><Ionicons name="warning-outline" size={20} color={COLORS.warning} /><Text style={styles.inlineErrorText}>Página indisponível ou endereço inválido.</Text><Pressable onPress={submitAddress} style={styles.retryButton}><Text style={styles.retryText}>Tentar</Text></Pressable></View>}
            </View>
          ) : <EmptyBrowser onFocus={() => setIsFocused(true)} />}
        </View>

        <View style={styles.statsRow}>
          {privacyStats.map((stat) => <View key={stat.label} style={styles.statItem}><Ionicons name={stat.icon} size={15} color={COLORS.muted} /><Text style={styles.statValue}>{stat.value}</Text><Text style={styles.statLabel}>{stat.label}</Text></View>)}
        </View>
        <View style={styles.bottomBar}>
          <IconButton name="chevron-back" label="Voltar na página" disabled={!activeTab.canGoBack} onPress={() => {}} />
          <IconButton name="chevron-forward" label="Avançar na página" disabled={!activeTab.canGoForward} onPress={() => {}} />
          <IconButton name="refresh-outline" label="Recarregar página" onPress={() => setPageVersion((current) => current + 1)} />
          <IconButton name="time-outline" label="Abrir histórico da sessão" onPress={() => setShowHistory(true)} />
          <Pressable accessibilityRole="button" accessibilityLabel={`Abrir abas privadas, ${tabs.length} abertas`} onPress={() => setShowTabs(true)} style={({ pressed }) => [styles.tabsButton, pressed && styles.pressed]}><Ionicons name="copy-outline" size={19} color={COLORS.text} /><Text style={styles.tabsCount}>{tabs.length}</Text></Pressable>
          <IconButton name="add" label="Nova aba privada" accent onPress={openNewTab} />
        </View>
        <Text style={styles.disclaimer}>Noctra reduz persistência local. Anonimato em nível Tor requer uma rede ou proxy Tor real.</Text>
      </View>

      <Modal visible={showTabs} transparent animationType="slide" onRequestClose={() => setShowTabs(false)}>
        <View style={styles.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => setShowTabs(false)} /><View style={styles.sheet}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetEyebrow}>ESPAÇO DESCARTÁVEL</Text><Text style={styles.sheetTitle}>Abas privadas</Text></View><IconButton name="close" label="Fechar painel de abas" onPress={() => setShowTabs(false)} /></View><ScrollView contentContainerStyle={styles.sheetList}>
          {tabs.map((tab, index) => <Pressable key={tab.id} accessibilityRole="button" accessibilityLabel={`Selecionar ${tab.title}`} onPress={() => { setActiveTabId(tab.id); setAddressMode(tab.url ? "url" : "search"); setAddressValue(tab.url ? displayAddress(tab.url) : ""); setShowTabs(false); }} style={({ pressed }) => [styles.tabCard, tab.id === activeTabId && styles.tabCardActive, pressed && styles.pressed]}><View style={styles.tabCardIcon}><Ionicons name={tab.url ? "globe-outline" : "sparkles-outline"} size={19} color={COLORS.purpleSoft} /></View><View style={styles.tabCardBody}><Text numberOfLines={1} style={styles.tabCardTitle}>{tab.title}</Text><Text numberOfLines={1} style={styles.tabCardUrl}>{tab.url ? displayAddress(tab.url) : "Pronta para pesquisar"}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Fechar aba ${index + 1}`} hitSlop={8} onPress={() => closeTab(tab.id)} style={styles.tabClose}><Ionicons name="close" size={18} color={COLORS.muted} /></Pressable></Pressable>)}
        </ScrollView><Pressable accessibilityRole="button" accessibilityLabel="Abrir nova aba privada" onPress={openNewTab} style={styles.sheetAction}><Ionicons name="add-circle-outline" size={20} color={COLORS.text} /><Text style={styles.sheetActionText}>Nova aba privada</Text></Pressable><Text style={styles.sheetFootnote}>Fechar uma aba desmonta sua leitura nativa e descarta os dados da sessão.</Text></View></View>
      </Modal>

      <Modal visible={showHistory} transparent animationType="slide" onRequestClose={() => setShowHistory(false)}>
        <View style={styles.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => setShowHistory(false)} /><View style={styles.sheet}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetEyebrow}>SOMENTE NESTA SESSÃO</Text><Text style={styles.sheetTitle}>Histórico privado</Text></View><IconButton name="close" label="Fechar histórico" onPress={() => setShowHistory(false)} /></View>
          {sessionHistory.length === 0 ? <View style={styles.historyEmpty}><Ionicons name="footsteps-outline" size={30} color={COLORS.muted} /><Text style={styles.historyEmptyTitle}>Nenhum rastro ainda</Text><Text style={styles.historyEmptyCopy}>Suas páginas aparecem aqui apenas enquanto esta sessão estiver aberta.</Text></View> : <ScrollView contentContainerStyle={styles.sheetList}>{sessionHistory.map((item) => <Pressable key={item.id} onPress={() => openHistoryItem(item.url)} style={styles.historyRow}><Ionicons name="globe-outline" size={18} color={COLORS.purpleSoft} /><View style={styles.historyBody}><Text numberOfLines={1} style={styles.historyTitle}>{item.title}</Text><Text numberOfLines={1} style={styles.historyUrl}>{displayAddress(item.url)}</Text></View><Ionicons name="arrow-forward" size={17} color={COLORS.muted} /></Pressable>)}</ScrollView>}
          <Pressable accessibilityRole="button" accessibilityLabel="Apagar histórico da sessão" onPress={() => setSessionHistory([])} style={styles.clearHistoryButton}><Ionicons name="trash-outline" size={18} color={COLORS.danger} /><Text style={styles.clearHistoryText}>Apagar histórico desta sessão</Text></Pressable>
        </View></View>
      </Modal>

      <Modal visible={showPrivacyInfo} transparent animationType="fade" onRequestClose={() => setShowPrivacyInfo(false)}>
        <View style={styles.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => setShowPrivacyInfo(false)} /><View style={styles.infoCard}><View style={styles.infoIcon}><Ionicons name="shield-checkmark" size={24} color={COLORS.text} /></View><Text style={styles.sheetEyebrow}>TRANSPARÊNCIA PRIMEIRO</Text><Text style={styles.infoTitle}>O que o Noctra protege</Text><Text style={styles.infoCopy}>Abas usam leitura nativa, cache desativado e armazenamento local reduzido. A camada básica bloqueia endpoints conhecidos de rastreamento, mas não substitui um bloqueador de conteúdo completo.</Text><Text style={styles.infoCopy}>O Noctra ainda não roteia tráfego pela rede Tor. Para anonimato em nível Tor, será necessária uma integração real com proxy ou rede Tor.</Text><Pressable onPress={() => setShowPrivacyInfo(false)} style={styles.infoButton}><Text style={styles.infoButtonText}>Entendi</Text></Pressable><Pressable onPress={() => { setShowPrivacyInfo(false); Linking.openURL("https://support.torproject.org/"); }} style={styles.infoLink}><Text style={styles.infoLinkText}>Saiba mais sobre Tor</Text><Ionicons name="open-outline" size={15} color={COLORS.pink} /></Pressable></View></View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: 16, paddingTop: 10 },
  topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  brandRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  brandMark: { alignItems: "center", backgroundColor: COLORS.purple, borderColor: COLORS.pink, borderRadius: 15, borderWidth: 2, height: 30, justifyContent: "center", shadowColor: COLORS.pink, shadowOpacity: 0.45, shadowRadius: 8, width: 30 },
  brandMarkDot: { backgroundColor: COLORS.text, borderRadius: 3, height: 6, width: 6 },
  brandName: { color: COLORS.text, fontSize: 15, fontWeight: "800", letterSpacing: 2.2 },
  brandSubtitle: { color: COLORS.muted, fontSize: 8, fontWeight: "700", letterSpacing: 1.7, marginTop: 2 },
  privateChip: { alignItems: "center", backgroundColor: "#19131d", borderColor: "#3b2940", borderRadius: 99, flexDirection: "row", gap: 7, paddingHorizontal: 11, paddingVertical: 8 },
  liveDot: { backgroundColor: COLORS.pink, borderRadius: 4, height: 7, shadowColor: COLORS.pink, shadowOpacity: 0.9, shadowRadius: 6, width: 7 },
  privateChipText: { color: COLORS.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  addressBar: { alignItems: "center", backgroundColor: COLORS.field, borderColor: "transparent", borderRadius: 20, borderWidth: 1, flexDirection: "row", minHeight: 58, paddingLeft: 10, paddingRight: 7 },
  addressBarFocused: { borderColor: COLORS.purpleSoft, shadowColor: COLORS.purple, shadowOpacity: 0.28, shadowRadius: 10 },
  modeButton: { alignItems: "center", flexDirection: "row", gap: 2, padding: 9 },
  addressInput: { color: COLORS.text, flex: 1, fontSize: 16, height: 54, paddingHorizontal: 7 },
  clearButton: { padding: 7 },
  goButton: { alignItems: "center", backgroundColor: COLORS.purple, borderRadius: 15, height: 42, justifyContent: "center", width: 42 },
  statusRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 10, marginTop: 10, paddingHorizontal: 5 },
  statusLeft: { alignItems: "center", flexDirection: "row", gap: 6 },
  statusText: { color: COLORS.muted, fontSize: 11, letterSpacing: 0.2 },
  modeHint: { alignItems: "center", flexDirection: "row", gap: 4, padding: 4 },
  modeHintText: { color: COLORS.pink, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  content: { backgroundColor: COLORS.panel, borderColor: COLORS.line, borderRadius: 22, borderWidth: 1, flex: 1, overflow: "hidden" },
  resultsContent: { padding: 18, paddingBottom: 28 },
  resultsHeader: { paddingBottom: 14, paddingHorizontal: 2 },
  resultsEyebrow: { color: COLORS.pink, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  resultsTitle: { color: COLORS.text, fontSize: 22, fontWeight: "800", marginTop: 6 },
  resultsMeta: { color: COLORS.muted, fontSize: 12, marginTop: 5 },
  resultCard: { alignItems: "flex-start", backgroundColor: COLORS.fieldSoft, borderColor: COLORS.line, borderRadius: 17, borderWidth: 1, flexDirection: "row", marginTop: 9, padding: 13 },
  resultIcon: { alignItems: "center", backgroundColor: "#30233d", borderRadius: 11, height: 34, justifyContent: "center", width: 34 },
  resultBody: { flex: 1, marginLeft: 11 },
  resultTitle: { color: COLORS.text, fontSize: 14, fontWeight: "800", lineHeight: 19 },
  resultUrl: { color: COLORS.purpleSoft, fontSize: 10, marginTop: 4 },
  resultDescription: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 6 },
  searchState: { alignItems: "center", flex: 1, justifyContent: "center", padding: 30 },
  loadingDot: { backgroundColor: COLORS.pink, borderRadius: 12, height: 18, marginBottom: 18, shadowColor: COLORS.pink, shadowOpacity: 0.8, shadowRadius: 16, width: 18 },
  searchStateTitle: { color: COLORS.text, fontSize: 16, fontWeight: "800", marginTop: 12, textAlign: "center" },
  searchStateCopy: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 6, maxWidth: 270, textAlign: "center" },
  noResults: { alignItems: "center", paddingHorizontal: 18, paddingVertical: 45 },
  pageContent: { padding: 20, paddingBottom: 34 },
  pageHeader: { borderBottomColor: COLORS.line, borderBottomWidth: 1, paddingBottom: 18 },
  pageEyebrow: { color: COLORS.pink, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  pageTitle: { color: COLORS.text, fontSize: 24, fontWeight: "800", lineHeight: 30, marginTop: 7 },
  pageDomain: { color: COLORS.purpleSoft, fontSize: 11, marginTop: 6 },
  pageLead: { color: COLORS.muted, fontSize: 13, lineHeight: 20, marginTop: 14 },
  pageParagraph: { color: COLORS.text, fontSize: 15, lineHeight: 24, marginTop: 18 },
  nativeLinks: { borderTopColor: COLORS.line, borderTopWidth: 1, marginTop: 26, paddingTop: 17 },
  linksTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800", marginBottom: 9 },
  nativeLink: { alignItems: "center", backgroundColor: COLORS.fieldSoft, borderRadius: 13, flexDirection: "row", gap: 9, marginTop: 7, padding: 12 },
  nativeLinkText: { color: COLORS.text, flex: 1, fontSize: 12, lineHeight: 17 },
  emptyState: { alignItems: "center", flex: 1, justifyContent: "center", paddingHorizontal: 32 },
  logoOrb: { alignItems: "center", backgroundColor: COLORS.purple, borderColor: COLORS.pink, borderRadius: 52, borderWidth: 5, height: 104, justifyContent: "center", marginBottom: 26, shadowColor: COLORS.pink, shadowOpacity: 0.6, shadowRadius: 24, width: 104 },
  logoOrbInner: { alignItems: "center", justifyContent: "center" },
  logoEyeRow: { flexDirection: "row", gap: 24, marginBottom: 12 },
  logoEye: { backgroundColor: COLORS.bg, borderRadius: 8, height: 16, width: 16 },
  logoMouth: { backgroundColor: COLORS.bg, height: 0, width: 0, borderLeftColor: "transparent", borderLeftWidth: 11, borderRightColor: "transparent", borderRightWidth: 11, borderTopColor: COLORS.bg, borderTopWidth: 18 },
  emptyTitle: { color: COLORS.text, fontSize: 22, fontWeight: "800", letterSpacing: -0.4, textAlign: "center" },
  emptyCopy: { color: COLORS.muted, fontSize: 13, lineHeight: 20, marginTop: 10, maxWidth: 290, textAlign: "center" },
  startButton: { alignItems: "center", backgroundColor: COLORS.purple, borderRadius: 17, flexDirection: "row", gap: 8, marginTop: 22, paddingHorizontal: 18, paddingVertical: 13 },
  startButtonText: { color: COLORS.text, fontSize: 13, fontWeight: "800" },
  browserFrame: { flex: 1, overflow: "hidden", position: "relative" },
  webSurface: { backgroundColor: COLORS.bg, flex: 1 },
  progressLine: { backgroundColor: COLORS.pink, height: 2, left: 0, position: "absolute", right: 0, top: 0, zIndex: 2 },
  inlineError: { alignItems: "center", backgroundColor: "#20191a", bottom: 12, borderColor: "#56302e", borderRadius: 14, flexDirection: "row", gap: 8, left: 12, paddingHorizontal: 12, paddingVertical: 10, position: "absolute", right: 12 },
  inlineErrorText: { color: COLORS.warning, flex: 1, fontSize: 11 },
  retryButton: { backgroundColor: COLORS.field, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 },
  retryText: { color: COLORS.text, fontSize: 11, fontWeight: "800" },
  pageMessage: { alignItems: "center", backgroundColor: COLORS.bg, flex: 1, justifyContent: "center", padding: 28 },
  pageMessageTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800", marginTop: 12, textAlign: "center" },
  pageMessageCopy: { color: COLORS.muted, fontSize: 13, lineHeight: 20, marginTop: 8, maxWidth: 290, textAlign: "center" },
  statsRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-around", paddingVertical: 13 },
  statItem: { alignItems: "center", flexDirection: "row", gap: 5 },
  statValue: { color: COLORS.text, fontSize: 11, fontWeight: "800" },
  statLabel: { color: COLORS.muted, fontSize: 10 },
  bottomBar: { alignItems: "center", backgroundColor: COLORS.panelRaised, borderColor: COLORS.line, borderRadius: 20, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", padding: 7 },
  iconButton: { alignItems: "center", borderRadius: 13, height: 42, justifyContent: "center", width: 42 },
  iconButtonAccent: { backgroundColor: COLORS.purple, shadowColor: COLORS.purple, shadowOpacity: 0.45, shadowRadius: 10 },
  tabsButton: { alignItems: "center", borderRadius: 13, flexDirection: "row", gap: 3, height: 42, justifyContent: "center", minWidth: 42, paddingHorizontal: 8 },
  tabsCount: { color: COLORS.text, fontSize: 12, fontWeight: "800" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  disclaimer: { color: "#716977", fontSize: 9, lineHeight: 14, paddingHorizontal: 12, paddingVertical: 8, textAlign: "center" },
  modalBackdrop: { backgroundColor: "rgba(0,0,0,0.78)", flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.panel, borderColor: COLORS.line, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, maxHeight: "82%", padding: 18, paddingBottom: 28 },
  sheetHandle: { alignSelf: "center", backgroundColor: "#625868", borderRadius: 99, height: 4, marginBottom: 19, width: 42 },
  sheetHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  sheetEyebrow: { color: COLORS.pink, fontSize: 9, fontWeight: "800", letterSpacing: 1.4, marginBottom: 5 },
  sheetTitle: { color: COLORS.text, fontSize: 23, fontWeight: "800" },
  sheetList: { gap: 9, paddingVertical: 7 },
  tabCard: { alignItems: "center", backgroundColor: COLORS.fieldSoft, borderColor: COLORS.line, borderRadius: 16, borderWidth: 1, flexDirection: "row", padding: 11 },
  tabCardActive: { borderColor: COLORS.purpleSoft, backgroundColor: "#241633" },
  tabCardIcon: { alignItems: "center", backgroundColor: "#30233d", borderRadius: 11, height: 38, justifyContent: "center", width: 38 },
  tabCardBody: { flex: 1, marginHorizontal: 10 },
  tabCardTitle: { color: COLORS.text, fontSize: 13, fontWeight: "700" },
  tabCardUrl: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  tabClose: { padding: 6 },
  sheetAction: { alignItems: "center", backgroundColor: COLORS.purple, borderRadius: 15, flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 10, paddingVertical: 14 },
  sheetActionText: { color: COLORS.text, fontSize: 13, fontWeight: "800" },
  sheetFootnote: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 12, textAlign: "center" },
  historyEmpty: { alignItems: "center", paddingHorizontal: 25, paddingVertical: 45 },
  historyEmptyTitle: { color: COLORS.text, fontSize: 16, fontWeight: "700", marginTop: 12 },
  historyEmptyCopy: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 6, textAlign: "center" },
  historyRow: { alignItems: "center", backgroundColor: COLORS.fieldSoft, borderRadius: 14, flexDirection: "row", gap: 10, padding: 12 },
  historyBody: { flex: 1 },
  historyTitle: { color: COLORS.text, fontSize: 12, fontWeight: "700" },
  historyUrl: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  clearHistoryButton: { alignItems: "center", borderColor: "#56303d", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 12, paddingVertical: 12 },
  clearHistoryText: { color: COLORS.danger, fontSize: 12, fontWeight: "700" },
  infoCard: { alignSelf: "center", backgroundColor: COLORS.panel, borderColor: COLORS.line, borderRadius: 24, borderWidth: 1, marginHorizontal: 22, padding: 22, width: "88%" },
  infoIcon: { alignItems: "center", backgroundColor: COLORS.purple, borderRadius: 16, height: 46, justifyContent: "center", marginBottom: 18, width: 46 },
  infoTitle: { color: COLORS.text, fontSize: 22, fontWeight: "800", marginBottom: 12 },
  infoCopy: { color: COLORS.muted, fontSize: 13, lineHeight: 20, marginBottom: 11 },
  infoButton: { alignItems: "center", backgroundColor: COLORS.purple, borderRadius: 14, marginTop: 5, paddingVertical: 13 },
  infoButtonText: { color: COLORS.text, fontSize: 13, fontWeight: "800" },
  infoLink: { alignItems: "center", flexDirection: "row", gap: 5, justifyContent: "center", paddingTop: 15 },
  infoLinkText: { color: COLORS.pink, fontSize: 12, fontWeight: "700" },
});
