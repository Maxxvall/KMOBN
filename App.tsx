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
import { loadEstimates, saveEstimates, loadTemplates, saveTemplates, addTemplate, loadMaterials, saveMaterials, addMaterial, updateMaterial, loadWorks, saveWorks, addWork, deleteWork, loadBundles, saveBundles, addBundle, updateBundle, deleteBundle, db } from './services/database';


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


    const handleCreateNew = () => {
        setCurrentEstimate(null);
        setView(View.EDITOR);
    };

    const handleEdit = (estimate: Estimate) => {
        setCurrentEstimate(estimate);
        setView(View.EDITOR);
    };

    const handleBackToHistory = () => {
        setCurrentEstimate(null);
        setView(View.HISTORY);
    };

    const handleSaveEstimate = useCallback((newEstimate: Estimate) => {
        setEstimates(prevEstimates => {
            // The editor passes the ID of the version being edited.
            const existingIndex = prevEstimates.findIndex(e => e.id === newEstimate.id);
            
            // If it exists and is not archived, we create a NEW version.
            if (existingIndex !== -1 && !prevEstimates[existingIndex].isArchived) {
                const oldEstimate = prevEstimates[existingIndex];
                
                // Create new version with a new unique ID
                const newVersion = { 
                    ...newEstimate, 
                    id: `sm-id-${Date.now()}`, 
                    version: oldEstimate.version + 1, 
                    parentId: oldEstimate.parentId || oldEstimate.id 
                };
                
                // Archive old version
                const archivedEstimate = { 
                    ...oldEstimate, 
                    isArchived: true,
                    status: EstimateStatus.ARCHIVED 
                };

                const updatedEstimates = [...prevEstimates];
                updatedEstimates[existingIndex] = archivedEstimate;
                
                return [...updatedEstimates, newVersion];
            } else {
                // This is for a completely new estimate.
                // The ID and number were already generated in the editor.
                return [...prevEstimates, newEstimate];
            }
        });
        setView(View.HISTORY);
    }, []);

    const handleDeleteEstimate = useCallback((estimateToDelete: Estimate) => {
        if (window.confirm(`Вы уверены, что хотите удалить смету №${estimateToDelete.estimateNumber} и все ее версии? Это действие необратимо.`)) {
            setEstimates(prevEstimates => {
                // A much more reliable way to delete: filter out ALL estimates
                // that share the same estimateNumber. This removes all versions.
                const estimateNumberToDelete = estimateToDelete.estimateNumber;
                return prevEstimates.filter(e => e.estimateNumber !== estimateNumberToDelete);
            });
        }
    }, []);

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
                await db.templates.delete(templateId);
                setTemplates(prev => prev.filter(t => t.id !== templateId));
                // Если удаленный шаблон был выбран, сбросить на первый
                setEstimates(prevEstimates => prevEstimates.map(est => ({
                    ...est,
                    // Если genParams есть, но это не здесь
                })));
                // Для EstimateEditor, нужно обновить genParams если выбранный шаблон удален
                // Но поскольку это callback, лучше обновить в EstimateEditor
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
                await db.materials.delete(materialId);
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
            await db.works.put(work);
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
            <Header currentView={view} onViewChange={setView} />
            <main className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
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
                                onSave={handleSaveEstimate}
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