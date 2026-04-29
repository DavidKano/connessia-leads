import { useState, useEffect } from "react";
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
  CheckSquare,
  Square
} from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { StatCard } from "../ui/StatCard";
import { Badge } from "../ui/Badge";
import { Modal } from "../ui/Modal";
import { getGoogleMapsApiKey, getUsageData, saveGoogleMapsApiKey, updateUsageCount, incrementUsageInDb } from "../../services/configStore";
import { useCrmStore } from "../../services/crmStore";
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
  'Abogados', 'Gestoría', 'Psicología'
];

export function LeadFinderScreen() {
  const [apiKey, setApiKey] = useState("");
  const [apiLimit, setApiLimit] = useState(parseInt(localStorage.getItem('gmaps_api_limit') || '3000', 10));
  const [usageCount, setUsageCount] = useState(0);
  const [hasRemoteKey, setHasRemoteKey] = useState(false);
  const [daysUntilReset, setDaysUntilReset] = useState(0);
  
  const [postalCode, setPostalCode] = useState("");
  const [searchMode, setSearchMode] = useState<"especifico" | "masivo">("masivo");
  const [businessType, setBusinessType] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [leads, setLeads] = useState<FinderLead[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  const [configDraft, setConfigDraft] = useState({ key: "", limit: apiLimit });

  const store = useCrmStore();

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
        if (usage) {
          const lastResetDate = new Date(usage.lastReset);
          const now = new Date();
          
          if (lastResetDate.getMonth() !== now.getMonth() || lastResetDate.getFullYear() !== now.getFullYear()) {
            await updateUsageCount(0, now.toISOString());
            setUsageCount(0);
          } else {
            setUsageCount(usage.count);
          }
        }

        // Calculate days until next month
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const diff = Math.ceil((nextMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        setDaysUntilReset(diff);

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
    if (existingScript) existingScript.remove();

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
      if (configDraft.key && configDraft.key !== "********************") {
        await saveGoogleMapsApiKey(configDraft.key);
        setApiKey(configDraft.key);
        setHasRemoteKey(true);
      }
      
      setApiLimit(configDraft.limit);
      localStorage.setItem('gmaps_api_limit', configDraft.limit.toString());
      
      if (apiKey || (configDraft.key && configDraft.key !== "********************")) {
        loadGoogleMapsScript(configDraft.key === "********************" ? apiKey : configDraft.key);
      }
      
      setShowConfig(false);
    } catch (err) {
      alert("Error al guardar la configuración: " + (err instanceof Error ? err.message : "Desconocido"));
    }
  };

  const incrementUsage = async (amount = 1) => {
    const newCount = usageCount + amount;
    setUsageCount(newCount);
    await incrementUsageInDb(amount);
  };

  const geocodePostalCode = (cp: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const geocoder = new (window as any).google.maps.Geocoder();
      geocoder.geocode({ address: cp + ', España' }, (results: any, status: any) => {
        if (status === 'OK' && results[0]) {
          resolve(results[0].geometry.location);
        } else {
          reject(new Error("No se encontró el código postal."));
        }
      });
    });
  };

  const getPlaceDetails = (service: any, placeId: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const request = {
        placeId: placeId,
        fields: ['address_components', 'formatted_phone_number', 'website', 'name', 'vicinity']
      };
      
      setTimeout(() => {
        service.getDetails(request, (place: any, status: any) => {
          incrementUsage(1);
          if (status === (window as any).google.maps.places.PlacesServiceStatus.OK && place) {
            resolve(place);
          } else {
            reject(new Error('Detail err'));
          }
        });
      }, 250);
    });
  };

  const performNearbySearch = (location: any, keyword: string) => {
    return new Promise<void>((resolve, reject) => {
      const mapDiv = document.createElement('div');
      const map = new (window as any).google.maps.Map(mapDiv, { center: location, zoom: 15 });
      const service = new (window as any).google.maps.places.PlacesService(map);
      
      const request = {
        location: location,
        radius: '3000',
        keyword: keyword,
      };
      
      const fetchPage = (req: any) => {
        service.nearbySearch(req, async (results: any, status: any, pagination: any) => {
          incrementUsage(1);
          if (status === (window as any).google.maps.places.PlacesServiceStatus.OK && results) {
            setLoadingMsg(`Extrayendo detalles de ${results.length} negocios para "${keyword}"...`);
            
            for (let place of results) {
              try {
                const details = await getPlaceDetails(service, place.place_id);
                addLead(details, keyword);
              } catch (e) {
                addLead(place, keyword);
              }
            }
            
            if (pagination && pagination.hasNextPage && usageCount < apiLimit) {
              setLoadingMsg(`Paginando resultados para "${keyword}"...`);
              setTimeout(() => pagination.nextPage(), 2000);
            } else {
              resolve();
            }
          } else if (status === (window as any).google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
            resolve(); 
          } else {
            reject(new Error(`Places Search falló: ${status}`));
          }
        });
      };
      
      fetchPage(request);
    });
  };

  const addLead = (place: any, tipo: string) => {
    let cp = '';
    let localidad = '';
    let provincia = '';
    
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
    
    setLeads(prev => [...prev, newLead]);
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
    selectedLeads.forEach(fLead => {
      const lead: Lead = {
        id: crypto.randomUUID(),
        nombreNegocio: fLead.nombre,
        personaContacto: "",
        telefono: fLead.telefono,
        email: "",
        direccion: fLead.direccion,
        ciudad: fLead.localidad,
        zona: fLead.provincia,
        sector: fLead.tipo,
        web: fLead.web,
        notas: `Obtenido via buscador Google Maps (CP ${fLead.cp})`,
        estado: "nuevo",
        etiquetas: ["Google Maps"],
        grupoIds: [],
        comercialAsignado: store.state.currentUser.uid,
        tieneConsentimientoWhatsapp: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      store.upsertLead(lead);
    });

    store.setToast(`${selectedIds.length} leads traspasados correctamente.`);
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

    if (!postalCode) return;
    if (searchMode === 'especifico' && !businessType) return;
    if (usageCount >= apiLimit) {
      alert(`Límite de peticiones alcanzado (${apiLimit}).`);
      return;
    }

    setIsSearching(true);
    setLeads([]);
    setLoadingMsg("Ubicando código postal...");

    try {
      const location = await geocodePostalCode(postalCode);
      incrementUsage(1);

      if (searchMode === 'especifico') {
        await performNearbySearch(location, businessType);
      } else {
        for (const keyword of masivoKeywords) {
          if (usageCount >= apiLimit) break;
          await performNearbySearch(location, keyword);
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
                    <th>Teléfono</th>
                    <th>Web</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                   {leads.map((lead) => (
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
