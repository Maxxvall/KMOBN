import React, { useState, useCallback, useEffect } from 'react';
import { Estimate, View, EstimateStatus, ProjectTemplate, Material, EstimateCategory, Work, EstimateSubgroup, WorkBundle } from './types';
import SyncToast from './components/SyncToast';
import Header from './components/Header';
import EstimateHistory from './components/EstimateHistory';
import EstimateEditor from './components/EstimateEditor';
import Prices from './components/Prices';
import Works from './components/Works';
import Bundles from './components/Bundles';
import SalaryCalculator from './components/SalaryCalculator';
import PdfStyleModal from './components/PdfStyleModal';
import Analytics from './components/Analytics';
import ScrollToTop from './components/ScrollToTop';
import { generatePdf } from './services/pdfGenerator';
import { generatePdf as generatePdfColored } from './services/pdfGenerator2';
import { searchPrice } from './services/priceService';
import { loadEstimates, saveEstimates, loadTemplates, saveTemplates, addTemplate, deleteTemplate, deleteEstimatesByNumber, loadMaterials, saveMaterials, addMaterial, updateMaterial, deleteMaterial, loadWorks, saveWorks, addWork, updateWork, deleteWork, loadBundles, saveBundles, addBundle, updateBundle, deleteBundle } from './services/database';


type SaveMode = 'overwrite' | 'new';

const App: React.FC = () => {
    const [view, setView] = useState<View>(View.HISTORY);
    const [estimates, setEstimates] = useState<Estimate[]>([]);
    const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [works, setWorks] = useState<Work[]>([]);
    const [bundles, setBundles] = useState<WorkBundle[]>([]);
    const [currentEstimate, setCurrentEstimate] = useState<Estimate | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [sync, setSync] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'info' }>({ visible: false, message: '', type: 'info' });
    const [showPdfStyleModal, setShowPdfStyleModal] = useState(false);
    const [pendingPdfEstimate, setPendingPdfEstimate] = useState<Estimate | null>(null);
    const [editorDirty, setEditorDirty] = useState(false);
    const [editorDraft, setEditorDraft] = useState<Estimate | null>(null);
    const [showSaveOptions, setShowSaveOptions] = useState(false);
    const [viewAfterSave, setViewAfterSave] = useState<View>(View.HISTORY);
    const [showUnsavedModal, setShowUnsavedModal] = useState(false);
    const [pendingView, setPendingView] = useState<View | null>(null);

    // Load estimates and templates from database on mount
    useEffect(() => {
        const initializeData = async () => {
            try {
                const loadedEstimates = await loadEstimates();
                const loadedTemplates = await loadTemplates();
                const loadedMaterials = await loadMaterials();
                const loadedWorks = await loadWorks();
                const loadedBundles = await loadBundles();
                if (loadedEstimates.length === 0) {
                    setEstimates([]);
                } else {
                    setEstimates(loadedEstimates);
                }
                if (loadedTemplates.length === 0) {
                    setTemplates([]);
                } else {
                    setTemplates(loadedTemplates);
                }
                setMaterials(loadedMaterials || []);
                setWorks(loadedWorks || []);
                setBundles(loadedBundles || []);
                setSync({ visible: true, message: 'Данные загружены', type: 'success' });
                setTimeout(() => setSync(s => ({ ...s, visible: false })), 3000);
            } catch (error) {
                console.error('Failed to load data:', error);
                setEstimates([]);
                setTemplates([]);
                setMaterials([]);
                setSync({ visible: true, message: 'Ошибка загрузки данных', type: 'error' });
                setTimeout(() => setSync(s => ({ ...s, visible: false })), 5000);
            } finally {
                setIsLoading(false);
            }
        };
        initializeData();
    }, []);

    // Save estimates to database whenever they change
    useEffect(() => {
        if (!isLoading) {
            saveEstimates(estimates).then(() => {
                setSync({ visible: true, message: 'Сметы сохранены', type: 'success' });
                setTimeout(() => setSync(s => ({ ...s, visible: false })), 2000);
            }).catch(error => {
                console.error('Failed to save estimates to database:', error);
                setSync({ visible: true, message: 'Ошибка сохранения смет', type: 'error' });
            });
        }
    }, [estimates, isLoading]);

    // Save materials to database whenever they change
    useEffect(() => {
        if (!isLoading) {
            saveMaterials(materials).then(() => {
                setSync({ visible: true, message: 'Материалы сохранены', type: 'success' });
                setTimeout(() => setSync(s => ({ ...s, visible: false })), 2000);
            }).catch(error => {
                console.error('Failed to save materials to database:', error);
                setSync({ visible: true, message: 'Ошибка сохранения материалов', type: 'error' });
            });
        }
    }, [materials, isLoading]);

    // Save works to database whenever they change
    useEffect(() => {
        if (!isLoading) {
            saveWorks(works).then(() => {
                setSync({ visible: true, message: 'Работы сохранены', type: 'success' });
                setTimeout(() => setSync(s => ({ ...s, visible: false })), 2000);
            }).catch(error => {
                console.error('Failed to save works to database:', error);
                setSync({ visible: true, message: 'Ошибка сохранения работ', type: 'error' });
            });
        }
    }, [works, isLoading]);

    // Save bundles to database whenever they change
    useEffect(() => {
        if (!isLoading) {
            saveBundles(bundles).then(() => {
                setSync({ visible: true, message: 'Комплекты сохранены', type: 'success' });
                setTimeout(() => setSync(s => ({ ...s, visible: false })), 2000);
            }).catch(error => {
                console.error('Failed to save bundles to database:', error);
                setSync({ visible: true, message: 'Ошибка сохранения комплектов', type: 'error' });
            });
        }
    }, [bundles, isLoading]);


    const goToView = useCallback((target: View) => {
        setView(target);
        if (target !== View.EDITOR) {
            setCurrentEstimate(null);
        }
    }, [setView, setCurrentEstimate]);

    const handleNavigationAttempt = useCallback((target: View) => {
        if (view === View.EDITOR && editorDirty && target !== View.EDITOR) {
            setPendingView(target);
            setShowUnsavedModal(true);
            return;
        }
        goToView(target);
    }, [view, editorDirty, goToView]);

    const handleCreateNew = () => {
        setCurrentEstimate(null);
        setEditorDirty(false);
        setEditorDraft(null);
        setPendingView(null);
        setShowSaveOptions(false);
        setShowUnsavedModal(false);
        goToView(View.EDITOR);
    };

    const handleEdit = (estimate: Estimate) => {
        setCurrentEstimate(estimate);
        setEditorDirty(false);
        setEditorDraft(null);
        setPendingView(null);
        setShowSaveOptions(false);
        setShowUnsavedModal(false);
        goToView(View.EDITOR);
    };

    const handleBackToHistory = () => {
        handleNavigationAttempt(View.HISTORY);
    };

    const handleSaveEstimate = useCallback((draft: Estimate, saveMode: SaveMode, afterSaveView: View = View.HISTORY) => {
        if (!draft) return;
        setEstimates(prevEstimates => {
            const existingIndex = prevEstimates.findIndex(e => e.id === draft.id);
            if (existingIndex !== -1) {
                const existing = prevEstimates[existingIndex];
                if (saveMode === 'overwrite') {
                    const updated = { ...draft, version: existing.version, parentId: existing.parentId };
                    const updatedEstimates = [...prevEstimates];
                    updatedEstimates[existingIndex] = updated;
                    return updatedEstimates;
                }
                const archivedEstimate = { ...existing, isArchived: true, status: EstimateStatus.ARCHIVED };
                const newVersion: Estimate = {
                    ...draft,
                    id: `sm-id-${Date.now()}`,
                    version: existing.version + 1,
                    parentId: existing.parentId || existing.id,
                };
                const updatedEstimates = [...prevEstimates];
                updatedEstimates[existingIndex] = archivedEstimate;
                return [...updatedEstimates, newVersion];
            }
            return [...prevEstimates, draft];
        });
        setEditorDirty(false);
        setEditorDraft(null);
        setShowSaveOptions(false);
        setPendingView(null);
        setShowUnsavedModal(false);
        setViewAfterSave(View.HISTORY);
        goToView(afterSaveView);
    }, [goToView, setEstimates]);

    const handleDeleteEstimate = useCallback(async (estimateToDelete: Estimate) => {
        if (!window.confirm(`Вы уверены, что хотите удалить смету №${estimateToDelete.estimateNumber} и все ее версии? Это действие необратимо.`)) return;
        const estimateNumberToDelete = estimateToDelete.estimateNumber;
        try {
            // Delete from Supabase first
            await deleteEstimatesByNumber(estimateNumberToDelete);
            // Update local state
            setEstimates(prevEstimates => prevEstimates.filter(e => e.estimateNumber !== estimateNumberToDelete));
            setSync({ visible: true, message: 'Сметы удалены из БД', type: 'success' });
            setTimeout(() => setSync(s => ({ ...s, visible: false })), 2000);
        } catch (error) {
            console.error('Failed to delete estimates from DB:', error);
            setSync({ visible: true, message: 'Ошибка удаления смет в БД', type: 'error' });
            setTimeout(() => setSync(s => ({ ...s, visible: false })), 4000);
        }
    }, []);

    const handleDraftChange = useCallback((draft: Estimate) => {
        setEditorDraft(draft);
    }, []);

    const handleDirtyChange = useCallback((dirty: boolean) => {
        setEditorDirty(dirty);
    }, []);

    const handleSaveRequest = useCallback((draft: Estimate) => {
        setEditorDraft(draft);
        setViewAfterSave(View.HISTORY);
        setShowSaveOptions(true);
        setShowUnsavedModal(false);
        setPendingView(null);
    }, []);

    const handleConfirmSave = useCallback((mode: SaveMode) => {
        if (!editorDraft) return;
        handleSaveEstimate(editorDraft, mode, viewAfterSave);
    }, [editorDraft, handleSaveEstimate, viewAfterSave]);

    const handleUnsavedSave = useCallback(() => {
        const target = pendingView ?? View.HISTORY;
        setViewAfterSave(target);
        setShowUnsavedModal(false);
        setShowSaveOptions(true);
    }, [pendingView]);

    const handleUnsavedDiscard = useCallback(() => {
        const target = pendingView ?? View.HISTORY;
        setShowUnsavedModal(false);
        setPendingView(null);
        setEditorDirty(false);
        setEditorDraft(null);
        goToView(target);
    }, [pendingView, goToView]);

    useEffect(() => {
        if (view !== View.EDITOR) {
            setShowSaveOptions(false);
            setShowUnsavedModal(false);
            setEditorDirty(false);
            setEditorDraft(null);
            setPendingView(null);
        }
    }, [view]);

    const handleGeneratePdf = useCallback((estimate: Estimate) => {
        setPendingPdfEstimate(estimate);
        setShowPdfStyleModal(true);
    }, []);

    const handlePdfStyleSelect = useCallback((style: 'simple' | 'colored') => {
        if (!pendingPdfEstimate) return;
        
        try {
            if (style === 'simple') {
                generatePdf(pendingPdfEstimate);
            } else {
                generatePdfColored(pendingPdfEstimate);
            }
        } catch (error) {
            console.error("PDF Generation Error:", error);
            alert("Не удалось сгенерировать PDF. Проверьте консоль для получения дополнительной информации.");
        } finally {
            setShowPdfStyleModal(false);
            setPendingPdfEstimate(null);
        }
    }, [pendingPdfEstimate]);

    const handleSaveAsTemplate = useCallback(async (estimate: Estimate) => {
        const templateName = prompt('Введите название шаблона:');
        if (templateName) {
            const newTemplate: ProjectTemplate = {
                id: `template-${Date.now()}`,
                name: templateName,
                baseArea: estimate.area,
                items: estimate.items, // Сохраняем элементы сметы в шаблон
            };
            try {
                await addTemplate(newTemplate);
                setTemplates(prev => [...prev, newTemplate]);
                alert('Шаблон сохранен!');
            } catch (error) {
                console.error('Failed to save template:', error);
                alert('Не удалось сохранить шаблон.');
            }
        }
    }, []);

    const handleDeleteTemplate = useCallback(async (templateId: string) => {
        if (window.confirm('Вы уверены, что хотите удалить этот шаблон?')) {
            try {
                await deleteTemplate(templateId);
                setTemplates(prev => prev.filter(t => t.id !== templateId));
            } catch (error) {
                console.error('Failed to delete template:', error);
                alert('Не удалось удалить шаблон.');
            }
        }
    }, []);

    const updateDraftEstimatesWithNewMaterialPrice = useCallback((materialName: string, newPrice: number) => {
        setEstimates(prevEstimates => {
            return prevEstimates.map(estimate => {
                if (estimate.status !== EstimateStatus.DRAFT) return estimate;
                const updatedItems = estimate.items.map(item => {
                    if (item.name === materialName && item.subgroup === EstimateSubgroup.MATERIALS) {
                        const updatedItem = { ...item, price: newPrice, total: item.quantity * newPrice };
                        return updatedItem;
                    }
                    return item;
                });
                const newTotal = updatedItems.reduce((sum, item) => sum + item.total, 0);
                return { ...estimate, items: updatedItems, total: newTotal };
            });
        });
    }, []);

    const handleAddMaterial = useCallback(async (name: string, category: EstimateCategory, price?: number, isManualPrice?: boolean) => {
        const newMaterial: Material = {
            id: `material-${Date.now()}`,
            name,
            price: price || 0,
            lastUpdated: new Date().toISOString(),
            category,
            isManualPrice: isManualPrice || false,
        };
        try {
            await addMaterial(newMaterial);
            setMaterials(prev => [...prev, newMaterial]);
        } catch (error) {
            console.error('Failed to add material:', error);
            alert('Не удалось добавить материал.');
        }
    }, []);

    const handleUpdatePrice = useCallback(async (materialId: string) => {
        const material = materials.find(m => m.id === materialId);
        if (!material || material.isManualPrice) return;

        try {
            const newPrice = await searchPrice(material.name);
            const updatedMaterial = { ...material, price: newPrice, lastUpdated: new Date().toISOString() };
            await updateMaterial(updatedMaterial);
            setMaterials(prev => prev.map(m => m.id === materialId ? updatedMaterial : m));
            // Update prices in draft estimates
            updateDraftEstimatesWithNewMaterialPrice(material.name, newPrice);
        } catch (error) {
            console.error('Failed to update price:', error);
        }
    }, [materials]);

    const handleUpdateAllPrices = useCallback(async () => {
        for (const material of materials) {
            await handleUpdatePrice(material.id);
        }
    }, [materials, handleUpdatePrice]);

    const handleEditMaterialPrice = useCallback(async (materialId: string, newPrice: number) => {
        const material = materials.find(m => m.id === materialId);
        if (!material) return;

        const updatedMaterial = { ...material, price: newPrice, lastUpdated: new Date().toISOString(), isManualPrice: true };
        try {
            await updateMaterial(updatedMaterial);
            setMaterials(prev => prev.map(m => m.id === materialId ? updatedMaterial : m));
            // Update prices in draft estimates
            updateDraftEstimatesWithNewMaterialPrice(material.name, newPrice);
        } catch (error) {
            console.error('Failed to update material price:', error);
            alert('Не удалось обновить цену материала.');
        }
    }, [materials]);

    const handleDeleteMaterial = useCallback(async (materialId: string) => {
        if (window.confirm('Вы уверены, что хотите удалить этот материал?')) {
            try {
                await deleteMaterial(materialId);
                setMaterials(prev => prev.filter(m => m.id !== materialId));
            } catch (error) {
                console.error('Failed to delete material:', error);
                alert('Не удалось удалить материал.');
            }
        }
    }, []);

    const handleAddWork = useCallback(async (name: string, category: EstimateCategory, price: number) => {
        const newWork: Work = {
            id: `work-${Date.now()}`,
            name,
            price,
            category,
        };
        try {
            await addWork(newWork);
            setWorks(prev => [...prev, newWork]);
        } catch (error) {
            console.error('Failed to add work:', error);
            alert('Не удалось добавить работу.');
        }
    }, []);

    const handleUpdateWork = useCallback(async (work: Work) => {
        try {
            await updateWork(work);
            setWorks(prev => prev.map(w => w.id === work.id ? work : w));
        } catch (error) {
            console.error('Failed to update work:', error);
            alert('Не удалось обновить работу.');
        }
    }, []);

    const handleDeleteWork = useCallback(async (workId: string) => {
        if (window.confirm('Вы уверены, что хотите удалить эту работу?')) {
            try {
                await deleteWork(workId);
                setWorks(prev => prev.filter(w => w.id !== workId));
            } catch (error) {
                console.error('Failed to delete work:', error);
                alert('Не удалось удалить работу.');
            }
        }
    }, []);

    const handleAddBundle = useCallback(async (bundle: WorkBundle) => {
        try {
            await addBundle(bundle);
            setBundles(prev => [...prev, bundle]);
        } catch (error) {
            console.error('Failed to add bundle:', error);
            alert('Не удалось добавить комплект.');
        }
    }, []);

    const handleUpdateBundle = useCallback(async (bundle: WorkBundle) => {
        try {
            await updateBundle(bundle);
            setBundles(prev => prev.map(b => b.id === bundle.id ? bundle : b));
        } catch (error) {
            console.error('Failed to update bundle:', error);
            alert('Не удалось обновить комплект.');
        }
    }, []);

    const handleDeleteBundle = useCallback(async (bundleId: string) => {
        if (window.confirm('Вы уверены, что хотите удалить этот комплект?')) {
            try {
                await deleteBundle(bundleId);
                setBundles(prev => prev.filter(b => b.id !== bundleId));
            } catch (error) {
                console.error('Failed to delete bundle:', error);
                alert('Не удалось удалить комплект.');
            }
        }
    }, []);


    return (
        <div className="min-h-screen bg-background text-text-primary">
            <Header currentView={view} onViewChange={handleNavigationAttempt} />
            <main className="p-3 sm:p-4 md:p-6 max-w-8xl mx-auto">
                {isLoading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="text-xl text-text-secondary">Загрузка смет...</div>
                    </div>
                ) : (
                    <>
                        {view === View.HISTORY && (
                            <EstimateHistory
                                estimates={estimates}
                                templates={templates}
                                onCreateNew={handleCreateNew}
                                onEdit={handleEdit}
                                onDelete={handleDeleteEstimate}
                                onGeneratePdf={handleGeneratePdf}
                            />
                        )}
                        {view === View.EDITOR && (
                            <EstimateEditor
                                initialEstimate={currentEstimate}
                                templates={templates}
                                materials={materials}
                                works={works}
                                bundles={bundles}
                                onRequestSave={handleSaveRequest}
                                onDraftChange={handleDraftChange}
                                onDirtyChange={handleDirtyChange}
                                onSaveAsTemplate={handleSaveAsTemplate}
                                onDeleteTemplate={handleDeleteTemplate}
                                onBack={handleBackToHistory}
                                allEstimates={estimates}
                            />
                        )}
                        {view === View.PRICES && (
                            <Prices
                                materials={materials}
                                onAddMaterial={handleAddMaterial}
                                onUpdatePrice={handleUpdatePrice}
                                onUpdateAllPrices={handleUpdateAllPrices}
                                onDeleteMaterial={handleDeleteMaterial}
                                onEditMaterialPrice={handleEditMaterialPrice}
                            />
                        )}
                        {view === View.WORKS && (
                            <Works
                                works={works}
                                onAddWork={handleAddWork}
                                onUpdateWork={handleUpdateWork}
                                onDeleteWork={handleDeleteWork}
                            />
                        )}
                        {view === View.BUNDLES && (
                            <Bundles
                                bundles={bundles}
                                works={works}
                                materials={materials}
                                onAddBundle={handleAddBundle}
                                onUpdateBundle={handleUpdateBundle}
                                onDeleteBundle={handleDeleteBundle}
                            />
                        )}
                        {view === View.SALARY_CALCULATOR && (
                            <SalaryCalculator
                                estimates={estimates}
                            />
                        )}
                        {view === View.ANALYTICS && (
                            <Analytics
                                estimates={estimates}
                            />
                        )}
                    </>
                )}
            </main>
            {showSaveOptions && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                    <div className="bg-surface p-6 rounded-xl shadow-2xl w-full max-w-md">
                        <h3 className="text-xl font-semibold mb-3">Сохранить изменения</h3>
                        <p className="text-sm text-text-secondary mb-5">Выберите, хотите ли вы обновить текущую версию сметы или создать новую.</p>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => handleConfirmSave('overwrite')}
                                className="w-full bg-primary text-white py-2 rounded-md font-semibold"
                            >
                                Сохранить в текущую версию
                            </button>
                            <button
                                onClick={() => handleConfirmSave('new')}
                                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-2 rounded-md font-semibold"
                            >
                                Создать новую версию
                            </button>
                            <button
                                onClick={() => setShowSaveOptions(false)}
                                className="w-full border border-border rounded-md py-2 font-semibold"
                            >
                                Отменить
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showUnsavedModal && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40">
                    <div className="bg-surface p-6 rounded-xl shadow-2xl w-full max-w-sm">
                        <h3 className="text-lg font-semibold mb-2">Несохранённые изменения</h3>
                        <p className="text-sm text-text-secondary mb-4">Вы внесли изменения в смету. Перейти к другой вкладке без сохранения приведёт к потере правок.</p>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleUnsavedSave}
                                className="w-full bg-primary text-white py-2 rounded-md font-semibold"
                            >
                                Сохранить изменения и продолжить
                            </button>
                            <button
                                onClick={handleUnsavedDiscard}
                                className="w-full bg-red-600 text-white py-2 rounded-md font-semibold"
                            >
                                Не сохранять и продолжить
                            </button>
                            <button
                                onClick={() => setShowUnsavedModal(false)}
                                className="w-full border border-border rounded-md py-2 font-semibold"
                            >
                                Отмена
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showPdfStyleModal && (
                <PdfStyleModal
                    onClose={() => {
                        setShowPdfStyleModal(false);
                        setPendingPdfEstimate(null);
                    }}
                    onSelectStyle={handlePdfStyleSelect}
                />
            )}
            <SyncToast visible={sync.visible} message={sync.message} type={sync.type} onClose={() => setSync(s => ({ ...s, visible: false }))} />
            <ScrollToTop />
        </div>
    );
};

export default App;