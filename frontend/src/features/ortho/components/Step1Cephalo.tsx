import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, Loader2, AlertCircle, Sun, Target, RefreshCw, Maximize2, Minimize2, X, Activity, CheckCircle2, Info, Aperture, MousePointer2, Settings2, SlidersHorizontal, Wand2
} from 'lucide-react';
import { CephaloTracingLayer } from '../CephaloTracingLayer';
import type { 
  UIMode, VTOSettings, ImageFilters 
} from '../cephaloShared';
import { useOrthoStore } from '../stores/useOrthoStore';
import { scienceArticles } from '../../../data/science_articles';
import { ClinicalTipBubble } from '../../clinical_tips/components/ClinicalTipBubble';

interface ThemePalette {
  bg: string;
  bgPanel: string;
  bgCard: string;
  bgInput: string;
  border: string;
  borderFocus: string;
  text: string;
  textMuted: string;
  textDim: string;
  accent: string;
  accentSuccess: string;
  accentWarning: string;
  accentError: string;
  shadow: string;
  shadowLg: string;
}

interface Step1CephaloProps {
  P: ThemePalette; // Theme palette
  fileRef: React.RefObject<HTMLInputElement | null>;
  step1ContainerRef: React.RefObject<HTMLDivElement | null>;
}

export const Step1Cephalo: React.FC<Step1CephaloProps> = ({ P, fileRef, step1ContainerRef }) => {
  const store = useOrthoStore();

  const [showTip, setShowTip] = React.useState(false);
  const [currentTip, setCurrentTip] = React.useState('');
  
  // Nouveaux états pour les menus flottants
  const [activeMenu, setActiveMenu] = useState<'none' | 'visual' | 'vto'>('none');

  React.useEffect(() => {
    if (!store.imageSrc) {
      if (scienceArticles.length > 0) {
        const randomArticle = scienceArticles[Math.floor(Math.random() * scienceArticles.length)];
        setCurrentTip(randomArticle.summary);
        
        const timer = setTimeout(() => {
          setShowTip(true);
        }, 1500);
        
        return () => {
          clearTimeout(timer);
          setShowTip(false);
        };
      }
    } else {
      setShowTip(false);
    }
  }, [store.imageSrc]);

  const handleCalibrationClick = (p: { x: number; y: number }) => {
    if (store.calibrationClickPoints.length < 2) {
      store.setCalibrationClickPoints([...store.calibrationClickPoints, p]);
    }
  };

  const cancelCalibration = () => {
    store.setShowCalibration(false);
    store.setCalibrationClickPoints([]);
    store.setCalibrationDistance('');
    store.setCalibrationStep('selecting');
  };

  const handleFileDrop = (files: FileList | null) => {
    if (!files?.length) return;
    if (!files[0].type.startsWith('image/')) {
      store.setUploadError('Format non supporté. Utilisez JPEG ou PNG.');
      return;
    }
    store.runAnalysis(files[0]);
  };

  const {
    imageSrc, mode, setMode, imgFilters, setImgFilters, isCalibrated, mmPerPixel, setShowCalibration,
    setCalibrationClickPoints, setCalibrationDistance, setCalibrationStep, magnifierEnabled, setMagnifierEnabled,
    vtoSettings, setVtoSettings, setImageSrc, setLocal, setAnglesData, isStep1Fullscreen, setIsStep1Fullscreen,
    visionMetadata, autoCalibMessage, showCalibration, calibrationClickPoints,
    calibrationStep, calibrationDistance, applyCalibration, local, imgDim,
    updateLandmarksOptimistic, activePointId, setActivePointId, anglesData,
    performanceMode, isUploading, uploadError,
    activeMorphing, setActiveMorphing
  } = store;

  // Calcul des projections de croissance (Ghosts T1 / T2)
  const computedGhosts = React.useMemo(() => {
    if (activeMorphing === 'none') return [];
    const projection = activeMorphing === 'T1' ? anglesData?.t1_projection : anglesData?.t2_projection;
    if (!projection || Object.keys(projection).length === 0) return [];

    const ghostLandmarks = Object.entries(projection).map(([id, coords]) => ({
      id,
      x: (coords as [number, number])[0],
      y: (coords as [number, number])[1]
    }));

    return [{
      landmarks: ghostLandmarks,
      opacity: 0.5,
      color: activeMorphing === 'T1' ? P.accent : P.accentSuccess
    }];
  }, [activeMorphing, anglesData, P]);

  // Si pas d'image, on garde le design d'upload (qui peut rester clair/sombre selon le thème global)
  if (!imageSrc) {
    return (
      <div className="flex-1 w-full flex flex-col items-center justify-center min-h-[400px] relative">
        {localStorage.getItem('clinical_tips_enabled') !== 'false' && (
          <ClinicalTipBubble 
            show={showTip} 
            tip={currentTip} 
            onClose={() => setShowTip(false)}
            autoHideMs={2000}
          />
        )}


        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => handleFileDrop(e.target.files)} />
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-6 max-w-md w-full px-6"
        >
          <div
            className="w-full flex flex-col items-center justify-center gap-6 rounded-2xl py-16 cursor-pointer transition-all duration-200"
            onClick={() => !isUploading && fileRef.current?.click()}
            style={{ border: `2px dashed ${P.border}`, background: P.bgCard }}
            onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLDivElement).style.borderColor = P.accent; }}
            onDragLeave={e => { e.preventDefault(); (e.currentTarget as HTMLDivElement).style.borderColor = P.border; }}
            onDrop={e => { e.preventDefault(); (e.currentTarget as HTMLDivElement).style.borderColor = P.border; handleFileDrop(e.dataTransfer.files); }}
          >
            {isUploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={40} className="animate-spin" style={{ color: P.accent }} />
                <span className="text-sm font-mono" style={{ color: P.textMuted }}>Analyse IA en cours...</span>
              </div>
            ) : (
              <>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: `${P.accent}15` }}>
                  <Upload size={32} style={{ color: P.accent }} />
                </div>
                <div className="text-center space-y-1">
                  <div className="font-semibold" style={{ color: P.text }}>Uploader une radiographie</div>
                  <div className="text-xs" style={{ color: P.textMuted }}>Glissez-déposez ou cliquez pour parcourir</div>
                </div>
              </>
            )}
          </div>

          <div className="flex items-start gap-3 p-4 rounded-xl mt-2" style={{ background: `${P.accent}05`, border: `1px solid ${P.border}` }}>
            <Info size={16} className="shrink-0 mt-0.5" style={{ color: P.accent }} />
            <p className="text-[11px] leading-relaxed" style={{ color: P.textMuted }}>
              <strong style={{ color: P.text }}>Exigence de Qualité :</strong> Veuillez importer une image numérique haute résolution. Les radiographies floues, pixélisées ou de faible contraste compromettent la précision de l'analyse IA et seront rejetées par le système.
            </p>
          </div>

          {uploadError && (
            <div className="flex items-center gap-2 text-sm" style={{ color: P.accentError }}>
              <AlertCircle size={16} />
              {uploadError}
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  // --- INTERFACE X-RAY RÉVOLUTIONNÉE ---
  // L'interface force le mode sombre cinématique (Noir profond) pour l'immersion radiologique.
  const isCinematic = true; 
  const cbg = '#020617'; // slate-950

  return (
    <div ref={step1ContainerRef} className={`relative flex flex-col rounded-3xl overflow-hidden ${isStep1Fullscreen ? 'fixed inset-0 z-[9999]' : 'h-[80vh] w-full'}`} style={{ background: cbg, boxShadow: 'inset 0 0 100px rgba(0,0,0,0.8)' }}>
      
      {/* CANVAS PRINCIPAL (FULL WIDTH/HEIGHT) */}
      <div className="absolute inset-0 z-0">
        <CephaloTracingLayer
          imageSrc={imageSrc}
          imgFilters={imgFilters}
          landmarks={local.landmarks}
          baseOpacity={1}
          ghosts={computedGhosts}
          imageWidth={imgDim.w}
          imageHeight={imgDim.h}
          onUpdateLandmarks={updateLandmarksOptimistic}
          activePointId={activePointId}
          focusedPointId={null}
          onPointMouseDown={setActivePointId}
          visualDebug={anglesData?.visual_debug ?? null}
          isCalibrating={showCalibration}
          calibrationPoints={calibrationClickPoints}
          onAddCalibrationPoint={handleCalibrationClick}
          uiMode={'pro'} // On force le rendu sombre/pro du traceur
          hoveredMetric={null}
          magnifierEnabled={magnifierEnabled}
          performanceMode={performanceMode}
          vto={vtoSettings}
        />
      </div>

      {/* GRADIENT OVERLAYS POUR LES DOCKS (Effet Cinématique) */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-slate-950/80 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-950/80 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-slate-950/80 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-slate-950/80 to-transparent pointer-events-none z-10" />

      {/* TOP HEADER (Minimaliste) */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/60 border border-slate-700/50 backdrop-blur-md">
            <Activity size={12} className="text-emerald-400" />
            <span className="text-[10px] font-bold text-emerald-400 tracking-widest uppercase">Édition Active</span>
          </div>
          {isCalibrated ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-900/30 border border-indigo-700/50 backdrop-blur-md">
              <Target size={12} className="text-indigo-400" />
              <span className="text-[10px] font-bold text-indigo-400 tracking-widest uppercase">{mmPerPixel?.toFixed(3)} mm/px</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-900/30 border border-amber-700/50 backdrop-blur-md cursor-pointer hover:bg-amber-900/50" onClick={() => { setShowCalibration(true); setCalibrationClickPoints([]); setCalibrationDistance(''); setCalibrationStep('selecting'); }}>
              <Target size={12} className="text-amber-400" />
              <span className="text-[10px] font-bold text-amber-400 tracking-widest uppercase">Non Calibré</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <button onClick={() => { setImageSrc(undefined); setLocal({ landmarks: [], version: 0 }); setAnglesData({}); }} className="p-2 rounded-full bg-slate-900/60 border border-slate-700/50 text-slate-300 hover:text-white hover:bg-slate-800 transition-all backdrop-blur-md" title="Changer d'image">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setIsStep1Fullscreen((v: boolean) => !v)} className="p-2 rounded-full bg-slate-900/60 border border-slate-700/50 text-slate-300 hover:text-white hover:bg-slate-800 transition-all backdrop-blur-md" title={isStep1Fullscreen ? 'Quitter plein écran' : 'Plein écran'}>
            {isStep1Fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* DOCK GAUCHE : Outils Visuels */}
      <div className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-30" onMouseLeave={() => setActiveMenu('none')}>
        <div className="flex flex-col gap-2 p-2 rounded-2xl bg-slate-900/60 border border-slate-700/50 backdrop-blur-xl shadow-2xl">
          
          {/* Calibrage */}
          <button 
            onClick={() => { setShowCalibration(true); setCalibrationClickPoints([]); setCalibrationDistance(''); setCalibrationStep('selecting'); }}
            className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${showCalibration ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/50' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}
            title="Calibrer l'échelle"
          >
            <Target size={18} />
          </button>

          {/* Loupe */}
          <button 
            onClick={() => setMagnifierEnabled((v: boolean) => !v)}
            className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${magnifierEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}
            title="Loupe"
          >
            <MousePointer2 size={18} />
          </button>

          <div className="w-6 h-px bg-slate-700/50 mx-auto my-1" />

          {/* Luminosité / Contraste Popover */}
          <div className="relative group">
            <button 
              onMouseEnter={() => setActiveMenu('visual')}
              className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${activeMenu === 'visual' || imgFilters.brightness !== 100 || imgFilters.contrast !== 110 ? 'bg-sky-500/20 text-sky-400 border border-sky-500/50' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}
            >
              <Sun size={18} />
            </button>
            <AnimatePresence>
              {activeMenu === 'visual' && (
                <motion.div 
                  initial={{ opacity: 0, x: -10, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -10, scale: 0.9 }}
                  className="absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 w-48 p-4 rounded-2xl bg-slate-900/80 border border-slate-700/50 backdrop-blur-2xl shadow-2xl flex flex-col gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <span>Luminosité</span>
                      <span>{imgFilters.brightness}%</span>
                    </div>
                    <input type="range" min={50} max={200} value={imgFilters.brightness} onChange={e => setImgFilters((f: ImageFilters) => ({ ...f, brightness: +e.target.value }))} className="w-full h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer" style={{ accentColor: '#38bdf8' }} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <span>Contraste</span>
                      <span>{imgFilters.contrast}%</span>
                    </div>
                    <input type="range" min={50} max={300} value={imgFilters.contrast} onChange={e => setImgFilters((f: ImageFilters) => ({ ...f, contrast: +e.target.value }))} className="w-full h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer" style={{ accentColor: '#fbbf24' }} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Invert */}
          <button 
            onClick={() => setImgFilters((f: ImageFilters) => ({ ...f, invert: !f.invert }))}
            className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${imgFilters.invert ? 'bg-white text-black border border-white shadow-[0_0_15px_rgba(255,255,255,0.5)]' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}
            title="Inverser les couleurs"
          >
            <Aperture size={18} />
          </button>
        </div>
      </div>

      {/* DOCK DROIT : VTO & Morphing */}
      <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-30">
        <div className="flex flex-col gap-2 p-2 rounded-2xl bg-slate-900/60 border border-slate-700/50 backdrop-blur-xl shadow-2xl">
          
          <button 
            onClick={() => setActiveMorphing(activeMorphing === 'T1' ? 'none' : 'T1')}
            className={`w-10 h-10 flex items-center justify-center rounded-xl text-[10px] font-black transition-all ${activeMorphing === 'T1' ? 'bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}
            title="Morphing à 1 an"
          >
            T1
          </button>
          
          <button 
            onClick={() => setActiveMorphing(activeMorphing === 'T2' ? 'none' : 'T2')}
            className={`w-10 h-10 flex items-center justify-center rounded-xl text-[10px] font-black transition-all ${activeMorphing === 'T2' ? 'bg-fuchsia-500 text-white shadow-[0_0_15px_rgba(217,70,239,0.5)]' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}
            title="Morphing à 5 ans"
          >
            T2
          </button>

          <div className="w-6 h-px bg-slate-700/50 mx-auto my-1" />

          <button 
            onClick={() => setVtoSettings((v: VTOSettings) => ({ ...v, showSoftTissue: !v.showSoftTissue }))}
            className={`w-10 h-10 flex items-center justify-center rounded-xl text-[9px] font-black transition-all leading-tight text-center ${vtoSettings.showSoftTissue ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}
          >
            SKIN
          </button>
          
          <button 
            onClick={() => setVtoSettings((v: VTOSettings) => ({ ...v, showGhostFace: !v.showGhostFace }))}
            className={`w-10 h-10 flex items-center justify-center rounded-xl text-[9px] font-black transition-all leading-tight text-center ${vtoSettings.showGhostFace ? 'bg-sky-500/20 text-sky-400 border border-sky-500/50' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}
          >
            3D
          </button>

          <div className="w-6 h-px bg-slate-700/50 mx-auto my-1" />

          <button 
            onClick={() => setVtoSettings((v: VTOSettings) => ({ ...v, enabled: !v.enabled }))}
            className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${vtoSettings.enabled ? 'bg-amber-500 text-white shadow-[0_0_20px_rgba(245,158,11,0.6)]' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}
            title="Simulation VTO Interactive"
          >
            <Wand2 size={18} />
          </button>
        </div>
      </div>

      {/* STUDIO VTO (Nouveau Design Haut de Gamme) */}
      <AnimatePresence>
        {vtoSettings.enabled && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[600px] p-6 rounded-[2rem] z-40 overflow-hidden"
            style={{ 
              background: 'rgba(15, 23, 42, 0.75)', // slate-900/75
              border: '1px solid rgba(245, 158, 11, 0.3)', // amber-500/30
              backdropFilter: 'blur(24px)',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7), 0 0 30px rgba(245,158,11,0.1)'
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-amber-500/5 to-transparent pointer-events-none" />
            
            <div className="relative flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg shadow-amber-500/20 text-slate-900">
                  <Wand2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-white tracking-widest uppercase">Studio VTO Proactive</h3>
                  <p className="text-[10px] font-mono text-amber-400/80">SIMULATION PRÉDICTIVE EN TEMPS RÉEL</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  const targetU1 = vtoSettings.u1_offset?.x || 0;
                  const targetL1 = vtoSettings.l1_offset?.x || 0;
                  const targetMand = vtoSettings.mand_offset?.x || 0;
                  setVtoSettings(v => ({...v, u1_offset: {x:0,y:0}, l1_offset: {x:0,y:0}, mand_offset: {x:0,y:0}}));
                  setTimeout(() => {
                     setVtoSettings(v => ({...v, u1_offset: {x:targetU1,y:0}, l1_offset: {x:targetL1,y:0}, mand_offset: {x:targetMand,y:0}}));
                  }, 100);
                }}
                className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-300 hover:text-white hover:bg-slate-800 transition-colors border border-slate-700"
              >
                Rejouer
              </button>
            </div>

            <div className="space-y-6">
              {/* INCISIVE SUP */}
              <div className="space-y-3">
                <div className="flex justify-between items-end px-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Incisive Supérieure (U1)</label>
                  <span className="text-sm font-mono font-bold text-sky-400">
                    {mmPerPixel ? ((vtoSettings.u1_offset?.x || 0) * mmPerPixel).toFixed(1) : 'NC'} <span className="text-[10px] opacity-50">{mmPerPixel ? 'mm' : ''}</span>
                  </span>
                </div>
                <input
                  type="range" min={-60} max={60} step={1}
                  value={vtoSettings.u1_offset?.x || 0}
                  onChange={(e) => setVtoSettings(v => ({ ...v, u1_offset: { x: +e.target.value, y: v.u1_offset?.y || 0 }}))}
                  className="w-full h-2 bg-slate-800 rounded-full appearance-none cursor-pointer"
                  style={{ accentColor: '#38bdf8' }}
                />
              </div>

              {/* INCISIVE INF */}
              <div className="space-y-3">
                <div className="flex justify-between items-end px-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Incisive Inférieure (L1)</label>
                  <span className="text-sm font-mono font-bold text-emerald-400">
                    {mmPerPixel ? ((vtoSettings.l1_offset?.x || 0) * mmPerPixel).toFixed(1) : 'NC'} <span className="text-[10px] opacity-50">{mmPerPixel ? 'mm' : ''}</span>
                  </span>
                </div>
                <input
                  type="range" min={-60} max={60} step={1}
                  value={vtoSettings.l1_offset?.x || 0}
                  onChange={(e) => setVtoSettings(v => ({ ...v, l1_offset: { x: +e.target.value, y: v.l1_offset?.y || 0 }}))}
                  className="w-full h-2 bg-slate-800 rounded-full appearance-none cursor-pointer"
                  style={{ accentColor: '#34d399' }}
                />
              </div>

              {/* MANDIBULE */}
              <div className="space-y-3">
                <div className="flex justify-between items-end px-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Avancement Mandibulaire</label>
                  <span className="text-sm font-mono font-bold text-amber-400">
                    {mmPerPixel ? ((vtoSettings.mand_offset?.x || 0) * mmPerPixel).toFixed(1) : 'NC'} <span className="text-[10px] opacity-50">{mmPerPixel ? 'mm' : ''}</span>
                  </span>
                </div>
                <input 
                  type="range" min={-100} max={100} step={1}
                  value={vtoSettings.mand_offset?.x || 0} 
                  onChange={(e) => setVtoSettings(v => ({ ...v, mand_offset: { x: +e.target.value, y: v.mand_offset?.y || 0 }}))}
                  className="w-full h-2 bg-slate-800 rounded-full appearance-none cursor-pointer" 
                  style={{ accentColor: '#fbbf24' }}
                />
              </div>
            </div>
            
            <div className="mt-8 flex justify-center">
              <button 
                onClick={() => setVtoSettings(v => ({ ...v, u1_offset: {x:0,y:0}, l1_offset: {x:0,y:0}, mand_offset: {x:0,y:0}}))}
                className="px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Réinitialiser la simulation
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interface de Calibration V2 (Modale Centrale sur fond sombre) */}
      <AnimatePresence>
        {showCalibration && (
          <motion.div initial={{ opacity: 0, y: -20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.95 }} className="absolute top-8 left-1/2 -translate-x-1/2 flex flex-col gap-4 p-6 rounded-2xl z-50 w-96" style={{ background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(16px)', border: `1px solid rgba(99,102,241,0.5)`, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/50">
                  <Target size={16} />
                </div>
                <span className="text-sm font-black tracking-widest uppercase text-white">
                  Calibration
                </span>
              </div>
              <button onClick={cancelCalibration} className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"><X size={16} /></button>
            </div>
            
            {calibrationStep === 'selecting' ? (
              <div className="space-y-4">
                <div className="text-xs text-slate-300 leading-relaxed">
                  {calibrationClickPoints.length === 0 && "1. Cliquez sur le premier point de référence sur la radio."}
                  {calibrationClickPoints.length === 1 && "2. Cliquez sur le deuxième point de référence."}
                  {calibrationClickPoints.length === 2 && "3. Entrez la distance réelle ci-dessous."}
                </div>
                
                {calibrationClickPoints.length === 2 && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3 bg-slate-900 rounded-xl p-2 border border-slate-700">
                      <span className="text-xs font-black uppercase text-slate-400 ml-2 flex-1">Distance (mm)</span>
                      <input type="number" value={calibrationDistance} onChange={(e) => setCalibrationDistance(e.target.value)} placeholder="Ex: 10" className="w-20 px-3 py-1.5 rounded-lg text-sm font-mono font-bold bg-slate-800 text-white outline-none border border-slate-600 focus:border-indigo-500 text-center" />
                    </div>
                    <button onClick={() => setCalibrationStep('entering')} disabled={!calibrationDistance || parseFloat(calibrationDistance) <= 0} className="w-full py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-50 disabled:hover:bg-indigo-500">
                      Valider la distance
                    </button>
                  </div>
                )}
                
                {calibrationClickPoints.length > 0 && (
                  <button onClick={() => setCalibrationClickPoints([])} className="w-full py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white">
                    Recommencer la sélection
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col items-center justify-center gap-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Distance Calculée</span>
                  <strong className="text-xl font-mono text-white">{calibrationDistance} mm</strong>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setCalibrationStep('selecting')} className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors">Modifier</button>
                  <button onClick={applyCalibration} className="flex-[2] py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20">Appliquer</button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD d'état (bas droite) */}
      <div className="absolute bottom-6 right-6 flex items-center gap-4 text-[10px] font-mono z-20 pointer-events-none">
        <div className="px-3 py-1.5 rounded-full bg-slate-900/60 border border-slate-700/50 backdrop-blur-md text-slate-300">
          Landmarks: <span className="text-white font-bold">{local.landmarks.length}</span>
        </div>
      </div>

    </div>
  );
};
