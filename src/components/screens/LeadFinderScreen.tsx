import { useState, useEffect, useMemo, useRef } from "react";
import { 
  Search, 
  Download, 
  Settings as SettingsIcon, 
  MapPin, 
  Store, 
  Globe, 
  Phone, 
  ShieldCheck, 
  AlertTriangle,
  Loader2,
  ArrowRightLeft,
  ArrowUpDown,
  CheckSquare,
  Square
} from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { StatCard } from "../ui/StatCard";
import { Badge } from "../ui/Badge";
import { Modal } from "../ui/Modal";
import { getCurrentUsageMonthKey, getDaysUntilUsageReset, getGoogleMapsApiKey, getUsageData, saveGoogleMapsApiKey, incrementUsageInDb } from "../../services/configStore";
import type { Lead } from "../../types/domain";

interface FinderLead {
  id: string;
  nombre: string;
  direccion: string;
  cp: string;
  localidad: string;
  provincia: string;
  telefono: string;
  web: string;
  tipo: string;
}

const inputClass =
  "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-connessia-500 focus:ring-2 focus:ring-connessia-100";

const masivoKeywords = [
  'Peluquerías', 'Clínica estética', 'Fisioterapia', 'Odontólogo', 
  'Veterinaria', 'Gimnasio', 'Taller mecánico', 'Mantenimiento del hogar',
  'Abogados', 'Gestoría', 'Psicología', 'Podólogos', 'Masajistas', 'Quiromasajistas'
];

function normalizeText(value: string) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]+/g, " ")
    .trim();
}

function normalizePhoneValue(value: string) {
  return (value || "").replace(/[^\d+]/g, "");
}

function sameFinderLead(a: FinderLead, b: FinderLead) {
  const phoneA = normalizePhoneValue(a.telefono);
  const phoneB = normalizePhoneValue(b.telefono);
  if (phoneA && phoneB && phoneA === phoneB) return true;
  if (a.web && b.web && a.web.toLowerCase() === b.web.toLowerCase()) return true;
  return normalizeText(a.nombre) === normalizeText(b.nombre) && normalizeText(a.direccion) === normalizeText(b.direccion);
}

function isKnownLead(finderLead: FinderLead, existingLeads: Lead[]) {
  const phone = normalizePhoneValue(finderLead.telefono || "");
  const web = (finderLead.web || "").toLowerCase();
  const name = normalizeText(finderLead.nombre || "");
  const address = normalizeText(finderLead.direccion || "");

  return (existingLeads || []).some((lead) => {
    const existingPhone = normalizePhoneValue(lead.telefono || "");
    if (phone && existingPhone && phone === existingPhone) return true;
    if (web && lead.web && lead.web.toLowerCase() === web) return true;
    return normalizeText(lead.nombreNegocio || "") === name && normalizeText(lead.direccion || "") === address;
  });
}

interface LeadFinderScreenProps {
  existingLeads: Lead[];
  importLeads: (leads: Lead[]) => void;
  setToast: (msg: string) => void;
}

export function LeadFinderScreen({ existingLeads, importLeads, setToast }: LeadFinderScreenProps) {
  const [apiKey, setApiKey] = useState("");
  const [apiLimit, setApiLimit] = useState(parseInt(localStorage.getItem('gmaps_api_limit') || '3000', 10));
  const [usageCount, setUsageCount] = useState(0);
  const [hasRemoteKey, setHasRemoteKey] = useState(false);
  const [daysUntilReset, setDaysUntilReset] = useState(0);
  const usageCountRef = useRef(0);
  const usageMonthKeyRef = useRef(getCurrentUsageMonthKey());
  
  const [postalCode, setPostalCode] = useState("");
  const [searchMode, setSearchMode] = useState<"especifico" | "masivo">("masivo");
  const [businessType, setBusinessType] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [leads, setLeads] = useState<FinderLead[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  const [configDraft, setConfigDraft] = useState({ key: "", limit: apiLimit });
  const [phoneSortDir, setPhoneSortDir] = useState<"asc" | "desc" | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const key = await getGoogleMapsApiKey();
        if (key) {
          setApiKey(key);
          setHasRemoteKey(true);
          setConfigDraft(prev => ({ ...prev, key: "********************" }));
        }

        const usage = await getUsageData();
        usageCountRef.current = usage.count;
        usageMonthKeyRef.current = usage.monthKey;
        setUsageCount(usage.count);
        setDaysUntilReset(getDaysUntilUsageReset());

      } catch (err) {
        console.error("Failed to load initial data", err);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    if (apiKey && !(window as any).google) {
      loadGoogleMapsScript(apiKey);
    }
  }, [apiKey]);

  const loadGoogleMapsScript = (key: string) => {
    const existingScript = document.getElementById('google-maps-script');
    if (existingScript) return; // Evitar cargar el script múltiples veces en Strict Mode

    const script = document.createElement("script");
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  };

  const handleSaveConfig = async () => {
    try {
      // Only save if the key was actually changed (not just showing asterisks)
      const isKeyChanged = configDraft.key && configDraft.key !== "********************";
      if (isKeyChanged) {
        const trimmedKey = configDraft.key.trim();
        await saveGoogleMapsApiKey(trimmedKey);
        setApiKey(trimmedKey);
        setHasRemoteKey(true);
      }
      
      setApiLimit(configDraft.limit);
      localStorage.setItem('gmaps_api_limit', configDraft.limit.toString());
      
      if (apiKey || (configDraft.key && configDraft.key !== "********************")) {
        loadGoogleMapsScript(configDraft.key === "********************" ? apiKey : configDraft.key);
      }
      
      setShowConfig(false);
      
      if (isKeyChanged) {
        // Recargar la página para inicializar Google Maps con la nueva API Key
        window.location.reload();
      }
    } catch (err) {
      alert("Error al guardar la configuración: " + (err instanceof Error ? err.message : "Desconocido"));
    }
  };

  const currentUsageCount = () => {
    if (usageMonthKeyRef.current !== getCurrentUsageMonthKey()) {
      usageMonthKeyRef.current = getCurrentUsageMonthKey();
      usageCountRef.current = 0;
      setUsageCount(0);
      setDaysUntilReset(getDaysUntilUsageReset());
    }
    return usageCountRef.current;
  };

  const incrementUsage = (amount = 1) => {
    const nextCount = currentUsageCount() + amount;
    usageCountRef.current = nextCount;
    setUsageCount(nextCount);
    setDaysUntilReset(getDaysUntilUsageReset());

    incrementUsageInDb(amount)
      .then((usage) => {
        usageMonthKeyRef.current = usage.monthKey;
        if (usage.monthKey !== getCurrentUsageMonthKey() || usage.count >= usageCountRef.current) {
          usageCountRef.current = usage.count;
          setUsageCount(usage.count);
        }
      })
      .catch((error) => {
        console.error("No se pudo guardar el uso de Google Maps", error);
      });

    return nextCount;
  };

  const formatGeocodeError = (status: string) => {
    switch (status) {
      case "REQUEST_DENIED":
        return "Google Maps rechazó la ubicación del código postal.";
      case "OVER_QUERY_LIMIT":
        return "Google Maps ha devuelto límite de cuota al ubicar el código postal.";
      case "INVALID_REQUEST":
        return "La petición para ubicar el código postal no es válida.";
      case "ZERO_RESULTS":
        return "No se encontró el código postal en España.";
      default:
        return `No se pudo ubicar el código postal. Google devolvió: ${status || "sin estado"}.`;
    }
  };

  const formatPlacesError = (status: string) => {
    switch (status) {
      case (window as any).google.maps.places.PlacesServiceStatus.REQUEST_DENIED:
        return "Google Maps rechazó la búsqueda de negocios. Revisa que la API key permita Maps JavaScript API y Places API para esta web.";
      case (window as any).google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT:
        return "Google Maps ha devuelto límite de cuota al buscar negocios.";
      case (window as any).google.maps.places.PlacesServiceStatus.INVALID_REQUEST:
        return "La petición de búsqueda de negocios no es válida.";
      case (window as any).google.maps.places.PlacesServiceStatus.ZERO_RESULTS:
        return "No se encontraron negocios para ese sector y código postal.";
      default:
        return `Places Search falló: ${status || "sin estado"}`;
    }
  };

  const geocodePostalCode = async (cp: string): Promise<any> => {
    console.log(`[Google Maps Debug] Iniciando geocodificación para el código postal: "${cp}"`);
    const cleanPostalCode = cp.trim();

    if (!/^\d{5}$/.test(cleanPostalCode)) {
      throw new Error("Introduce un código postal español válido de 5 dígitos.");
    }

    const geocoder = new (window as any).google.maps.Geocoder();
    const requests = [
      { componentRestrictions: { country: "ES", postalCode: cleanPostalCode }, region: "es" },
      { address: `${cleanPostalCode}, España`, region: "es" },
      { address: `código postal ${cleanPostalCode}, España`, region: "es" },
    ];

    let lastStatus = "";

    for (const request of requests) {
      const result = await new Promise<any | null>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          console.error(`[Google Maps Debug] Timeout alcanzado al ubicar CP: "${cleanPostalCode}"`);
          reject(new Error("Tiempo de espera agotado al ubicar el código postal."));
        }, 10000);

        try {
          geocoder.geocode(request, (results: any[] | null, status: string) => {
            clearTimeout(timeoutId);
            lastStatus = status;
            console.log(`[Google Maps Debug] Geocoder respuesta recibida. Status: "${status}"`);
            if (status === "OK" && results?.[0]) resolve(results[0]);
            else if (status !== "ZERO_RESULTS") reject(new Error(formatGeocodeError(status)));
            else resolve(null);
          });
        } catch (err) {
          clearTimeout(timeoutId);
          reject(err);
        }
      });
      if (result) return result.geometry.location;
    }
    throw new Error(formatGeocodeError(lastStatus || "ZERO_RESULTS"));
  };

  const getPlaceDetails = (service: any, placeId: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const request = {
        placeId: placeId,
        fields: ['address_components', 'formatted_phone_number', 'website', 'name', 'vicinity']
      };
      const timeoutId = setTimeout(() => reject(new Error("Timeout obteniendo detalles.")), 8000);
      service.getDetails(request, (place: any, status: any) => {
        clearTimeout(timeoutId);
        incrementUsage(1);
        if (status === (window as any).google.maps.places.PlacesServiceStatus.OK && place) resolve(place);
        else reject(new Error(`Detalle falló: ${status}`));
      });
    });
  };

  const performNearbySearch = (location: any, keyword: string) => {
    return new Promise<void>((resolve, reject) => {
      try {
        const mapDiv = document.createElement('div');
        const map = new (window as any).google.maps.Map(mapDiv, { center: location, zoom: 15 });
        const service = new (window as any).google.maps.places.PlacesService(map);
        let timeoutId: any = null;
        const clearSafety = () => { if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; } };
        const setSafety = () => { clearSafety(); timeoutId = setTimeout(() => reject(new Error("Timeout.")), 15000); };
        
        const fetchPage = (req: any) => {
          setSafety();
          service.nearbySearch(req, async (results: any, status: any, pagination: any) => {
            clearSafety();
            incrementUsage(1);
            if (status === (window as any).google.maps.places.PlacesServiceStatus.OK && results) {
              for (let place of results) {
                try { const d = await getPlaceDetails(service, place.place_id); addLead(d, keyword); } 
                catch (e) { addLead(place, keyword); }
              }
              if (pagination && pagination.hasNextPage && currentUsageCount() < apiLimit) {
                setTimeout(() => { setSafety(); pagination.nextPage(); }, 2000);
              } else resolve();
            } else if (status === (window as any).google.maps.places.PlacesServiceStatus.ZERO_RESULTS) resolve();
            else reject(new Error(formatPlacesError(status)));
          });
        };
        fetchPage({ location, radius: '3000', keyword });
      } catch (err) { reject(err); }
    });
  };

  const performTextSearch = (postalCodeQuery: string, keyword: string) => {
    return new Promise<void>((resolve, reject) => {
      try {
        const mapDiv = document.createElement('div');
        const map = new (window as any).google.maps.Map(mapDiv, { center: new (window as any).google.maps.LatLng(40.4168, -3.7038), zoom: 6 });
        const service = new (window as any).google.maps.places.PlacesService(map);
        let timeoutId: any = null;
        const clearSafety = () => { if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; } };
        const setSafety = () => { clearSafety(); timeoutId = setTimeout(() => reject(new Error("Timeout.")), 15000); };

        const fetchPage = (req: any) => {
          setSafety();
          service.textSearch(req, async (results: any, status: any, pagination: any) => {
            clearSafety();
            incrementUsage(1);
            if (status === (window as any).google.maps.places.PlacesServiceStatus.OK && results) {
              for (let place of results) {
                try { const d = await getPlaceDetails(service, place.place_id); addLead(d, keyword); }
                catch (e) { addLead(place, keyword); }
              }
              if (pagination && pagination.hasNextPage && currentUsageCount() < apiLimit) {
                setTimeout(() => { setSafety(); pagination.nextPage(); }, 2000);
              } else resolve();
            } else if (status === (window as any).google.maps.places.PlacesServiceStatus.ZERO_RESULTS) resolve();
            else reject(new Error(formatPlacesError(status)));
          });
        };
        fetchPage({ query: `${keyword} ${postalCodeQuery} España`, region: 'es' });
      } catch (err) { reject(err); }
    });
  };

  const addLead = (place: any, tipo: string) => {
    let cp = '', localidad = '', provincia = '';
    if (place.address_components) {
      place.address_components.forEach((comp: any) => {
        if (comp.types.includes('postal_code')) cp = comp.long_name;
        if (comp.types.includes('locality')) localidad = comp.long_name;
        if (comp.types.includes('administrative_area_level_2')) provincia = comp.long_name;
      });
    }

    const newLead: FinderLead = {
      id: crypto.randomUUID(),
      nombre: place.name || '',
      direccion: place.vicinity || place.formatted_address || '',
      cp: cp || postalCode,
      localidad: localidad,
      provincia: provincia,
      telefono: place.formatted_phone_number || '',
      web: place.website || '',
      tipo: tipo || ''
    };

    if (isKnownLead(newLead, existingLeads)) return;
    
    setLeads(prev => prev.some((item) => sameFinderLead(item, newLead)) ? prev : [...prev, newLead]);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === leads.length) setSelectedIds([]);
    else setSelectedIds(leads.map(l => l.id));
  };

  const handleTransfer = () => {
    if (selectedIds.length === 0) return;
    
    const selectedLeads = leads.filter(l => selectedIds.includes(l.id));
    const leadsToImport: Lead[] = [];
    
    selectedLeads.forEach(fLead => {
      if (isKnownLead(fLead, existingLeads)) return;
      const lead: Lead = {
        id: crypto.randomUUID(),
        nombreNegocio: fLead.nombre,
        personaContacto: "",
        telefono: normalizePhoneValue(fLead.telefono),
        email: "",
        direccion: fLead.direccion,
        ciudad: fLead.localidad,
        codigoPostal: fLead.cp,
        zona: fLead.provincia,
        sector: fLead.tipo,
        web: fLead.web,
        notas: `Obtenido via buscador Google Maps (CP ${fLead.cp})`,
        estado: "nuevo",
        etiquetas: ["Google Maps"],
        grupoIds: [],
        comercialAsignado: "",
        tieneConsentimientoWhatsapp: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      leadsToImport.push(lead);
    });

    if (leadsToImport.length > 0) {
      importLeads(leadsToImport);
    }

    setToast(`${leadsToImport.length} leads traspasados correctamente. ${selectedIds.length - leadsToImport.length} ya existian y se omitieron.`);
    setLeads(prev => prev.filter(l => !selectedIds.includes(l.id)));
    setSelectedIds([]);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSearching) return;
    if (!(window as any).google) {
      alert("La API de Google Maps no está cargada. Configura tu API Key.");
      setShowConfig(true);
      return;
    }

    const cleanPostalCode = postalCode.trim();
    if (!cleanPostalCode) return;
    if (searchMode === 'especifico' && !businessType) return;
    if (currentUsageCount() >= apiLimit) {
      alert(`Límite de peticiones alcanzado (${apiLimit}).`);
      return;
    }

    setIsSearching(true);
    setLeads([]);
    setLoadingMsg("Ubicando código postal...");

    try {
      let location: any | null = null;

      try {
        location = await geocodePostalCode(cleanPostalCode);
        incrementUsage(1);
      } catch (locationError) {
        console.warn("No se pudo ubicar el código postal, se usará búsqueda por texto en Google Places.", locationError);
      }

      if (searchMode === 'especifico') {
        setLoadingMsg(location ? `Buscando "${businessType}" cerca del CP ${cleanPostalCode}...` : `Buscando "${businessType}" en CP ${cleanPostalCode}...`);
        if (location) {
          await performNearbySearch(location, businessType);
        } else {
          await performTextSearch(cleanPostalCode, businessType);
        }
      } else {
        for (const keyword of masivoKeywords) {
          if (currentUsageCount() >= apiLimit) break;
          setLoadingMsg(location ? `Buscando "${keyword}" cerca del CP ${cleanPostalCode}...` : `Buscando "${keyword}" en CP ${cleanPostalCode}...`);
          if (location) {
            await performNearbySearch(location, keyword);
          } else {
            await performTextSearch(cleanPostalCode, keyword);
          }
        }
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsSearching(false);
      setLoadingMsg("");
    }
  };


  const limitPercentage = apiLimit > 0 ? (usageCount / apiLimit) * 100 : 0;

  const sortedLeads = useMemo(() => {
    if (!phoneSortDir) return leads;
    return [...leads].sort((a, b) => {
      const phoneA = a.telefono || "";
      const phoneB = b.telefono || "";
      return phoneSortDir === "asc" 
        ? phoneA.localeCompare(phoneB) 
        : phoneB.localeCompare(phoneA);
    });
  }, [leads, phoneSortDir]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-950">Obtención de Leads</h2>
          <p className="text-slate-500">Busca negocios directamente en Google Maps por código postal.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<SettingsIcon size={18} />} onClick={() => setShowConfig(true)}>
            Configuración
          </Button>
          <Button icon={<ArrowRightLeft size={18} />} onClick={handleTransfer} disabled={selectedIds.length === 0}>
            Traspasar a Leads ({selectedIds.length})
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="mb-4 font-bold text-slate-950 flex items-center gap-2">
              <Search size={18} className="text-connessia-600" />
              Nueva Búsqueda
            </h3>
            <form onSubmit={handleSearch} className="space-y-4">
              <label>
                <span className="mb-1 block text-sm font-semibold text-slate-700">Código Postal</span>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 text-slate-400" size={18} />
                  <input 
                    className={`${inputClass} pl-10`} 
                    placeholder="Ej: 28001" 
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    required 
                  />
                </div>
              </label>

              <label>
                <span className="mb-1 block text-sm font-semibold text-slate-700">Modo de Búsqueda</span>
                <select 
                  className={inputClass} 
                  value={searchMode} 
                  onChange={(e) => setSearchMode(e.target.value as any)}
                >
                  <option value="masivo">Búsqueda masiva (Múltiples sectores)</option>
                  <option value="especifico">Buscar uno específico</option>
                </select>
              </label>

              {searchMode === 'especifico' && (
                <label>
                  <span className="mb-1 block text-sm font-semibold text-slate-700">Tipo de Negocio</span>
                  <div className="relative">
                    <Store className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input 
                      className={`${inputClass} pl-10`} 
                      placeholder="Ej: Peluquerías, Talleres..." 
                      value={businessType}
                      onChange={(e) => setBusinessType(e.target.value)}
                      required 
                    />
                  </div>
                </label>
              )}

              <Button 
                className="w-full" 
                type="submit" 
                disabled={isSearching}
                icon={isSearching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
              >
                {isSearching ? "Buscando..." : "Buscar Leads"}
              </Button>
            </form>
          </Card>

          <Card className="p-5">
            <h3 className="mb-4 font-bold text-slate-950">Estado de la API</h3>
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Uso este mes:</span>
                <div className="text-right">
                  <span className="font-bold text-slate-900">{usageCount} / {apiLimit}</span>
                  <p className="text-[10px] text-slate-400 mt-0.5">-{daysUntilReset} días para reiniciar</p>
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div 
                  className={`h-full transition-all ${limitPercentage > 90 ? 'bg-coral-500' : 'bg-connessia-500'}`} 
                  style={{ width: `${Math.min(limitPercentage, 100)}%` }}
                />
              </div>
              {limitPercentage >= 80 && (
                <div className="flex items-start gap-2 rounded-lg border border-coral-100 bg-coral-50 p-3 text-xs text-coral-700">
                  <AlertTriangle size={14} className="shrink-0" />
                  <p>Has superado el 80% de tu cuota de seguridad establecida.</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label="Resultados" value={leads.length} icon={<Users size={22} />} tone="blue" />
            <StatCard label="Uso API" value={usageCount} icon={<Globe size={22} />} tone="slate" />
          </div>

          <Card className="overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-950">Resultados de Búsqueda</h3>
              {isSearching && (
                <div className="flex items-center gap-2 text-sm text-connessia-600 font-medium">
                  <Loader2 size={14} className="animate-spin" />
                  {loadingMsg}
                </div>
              )}
            </div>
            <div className="overflow-x-auto table-scroll">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                   <tr>
                    <th className="px-4 py-3 w-10">
                      <button onClick={toggleSelectAll} className="text-slate-400 hover:text-connessia-600">
                        {selectedIds.length === leads.length && leads.length > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                    </th>
                    <th>Negocio</th>
                    <th>Dirección</th>
                    <th>Código Postal</th>
                    <th>
                      <button 
                        onClick={() => setPhoneSortDir(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}
                        className="flex items-center gap-1 hover:text-connessia-600 transition-colors uppercase font-bold"
                      >
                        Teléfono
                        <ArrowUpDown size={14} className={phoneSortDir ? 'text-connessia-600' : 'text-slate-400'} />
                      </button>
                    </th>
                    <th>Web</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                   {sortedLeads.map((lead) => (
                    <tr key={lead.id} className={`hover:bg-slate-50 ${selectedIds.includes(lead.id) ? 'bg-connessia-50/50' : ''}`}>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleSelect(lead.id)} className={selectedIds.includes(lead.id) ? 'text-connessia-600' : 'text-slate-300'}>
                          {selectedIds.includes(lead.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                        </button>
                      </td>
                      <td>
                        <p className="font-bold text-slate-900">{lead.nombre}</p>
                        <p className="text-xs text-slate-500">{lead.tipo}</p>
                      </td>
                      <td className="text-slate-600">{lead.direccion}</td>
                      <td className="text-slate-600">{lead.cp}</td>
                      <td>{lead.telefono || <span className="opacity-30 italic">N/A</span>}</td>
                      <td>
                        {lead.web ? (
                          <a href={lead.web} target="_blank" rel="noreferrer" className="text-connessia-600 hover:underline">
                            Ver web
                          </a>
                        ) : (
                          <span className="opacity-30 italic">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {leads.length === 0 && !isSearching && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <Globe size={48} className="mb-2 opacity-20" />
                          <p>Inicia una búsqueda para ver los resultados aquí.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      {showConfig && (
        <Modal title="Configuración de API" onClose={() => setShowConfig(false)}>
          <div className="space-y-4">
            <label>
              <span className="mb-1 block text-sm font-semibold text-slate-700">API Key (Google Maps)</span>
              <input 
                type="text"
                className={inputClass} 
                value={configDraft.key}
                onChange={(e) => setConfigDraft({ ...configDraft, key: e.target.value })}
                onFocus={(e) => {
                  if (configDraft.key === "********************") {
                    setConfigDraft({ ...configDraft, key: "" });
                  }
                }}
                placeholder={hasRemoteKey ? "Configurada (escribe para cambiar)" : "AIzaSy..."} 
              />
              <p className="mt-1 text-xs text-slate-500">
                La clave se guarda **encriptada** en la base de datos y no es visible para nadie.
              </p>
            </label>
            <label>
              <span className="mb-1 block text-sm font-semibold text-slate-700">Aviso de Límite Mensual (Peticiones)</span>
              <input 
                type="number"
                className={inputClass} 
                value={configDraft.limit}
                onChange={(e) => setConfigDraft({ ...configDraft, limit: parseInt(e.target.value) || 0 })}
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowConfig(false)}>Cancelar</Button>
              <Button onClick={handleSaveConfig}>Guardar</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Users({ size, className }: { size?: number; className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}
