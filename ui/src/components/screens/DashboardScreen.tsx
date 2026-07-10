"use client";

import { useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, Package, PackagePlus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCreateOmniProduct,
  useOmniProducts,
  useOmniProjects,
  useUpdateOmniProjectProfile,
} from "@/hooks/useOmniStudio";
import { buildManualProductRefs } from "@/lib/omni/navigator";

type DashboardScreenProps = {
  selectedProjectId: number | null;
  selectedProductId: number | null;
  onSelectProduct: (productId: number | null) => void;
};

type ProductDraft = {
  name: string;
  description: string;
  referenceUrl: string;
};

const emptyProductDraft: ProductDraft = {
  name: "",
  description: "",
  referenceUrl: "",
};

export function DashboardScreen({ selectedProjectId, selectedProductId, onSelectProduct }: DashboardScreenProps) {
  const projectsQuery = useOmniProjects();
  const projects = useMemo(() => projectsQuery.data || [], [projectsQuery.data]);
  const activeProject = projects.find((project) => project.id === selectedProjectId) || null;
  const productsQuery = useOmniProducts(activeProject?.id || null);
  const createProductMutation = useCreateOmniProduct();
  const updateProjectMutation = useUpdateOmniProjectProfile();

  const products = useMemo(() => productsQuery.data || [], [productsQuery.data]);
  const activeProduct = products.find((product) => product.id === selectedProductId) || null;
  const [productDraft, setProductDraft] = useState<ProductDraft>(emptyProductDraft);

  useEffect(() => {
    if (selectedProductId && !products.some((product) => product.id === selectedProductId)) {
      onSelectProduct(null);
    }
  }, [onSelectProduct, products, selectedProductId]);

  const canCreateProduct =
    Boolean(activeProject) &&
    Boolean(productDraft.name.trim()) &&
    Boolean(productDraft.description.trim()) &&
    Boolean(productDraft.referenceUrl.trim()) &&
    !createProductMutation.isPending;

  const handleCreateProduct = async () => {
    if (!activeProject || !canCreateProduct) return;
    const product = await createProductMutation.mutateAsync({
      projectId: activeProject.id,
      name: productDraft.name,
      description: productDraft.description,
      targetDurationSeconds: 30,
      productRefs: buildManualProductRefs(productDraft.referenceUrl),
    });
    onSelectProduct(product.id);
    setProductDraft(emptyProductDraft);
  };

  if (!activeProject) {
    return (
      <div className="mx-auto max-w-[94rem] rounded-lg border border-border bg-card p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Клиент</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Выберите клиента слева</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          После выбора клиента здесь появятся tone of voice, целевая аудитория и продукты этого клиента.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-[94rem] gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <section className="space-y-5">
        <ClientProfileCard
          key={activeProject.id}
          project={activeProject}
          isSaving={updateProjectMutation.isPending}
          onSave={(targetAudience, brandVoice) =>
            updateProjectMutation.mutate({
              projectId: activeProject.id,
              targetAudience,
              brandVoice,
            })
          }
        />

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Продукты</p>
              <h3 className="mt-1 text-lg font-semibold text-foreground">Продукты клиента</h3>
            </div>
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
              {products.length} всего
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {products.map((product) => {
              const isActive = product.id === selectedProductId;
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onSelectProduct(product.id)}
                  className={`rounded-lg border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isActive ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted/35"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-semibold text-foreground">{product.name}</h4>
                      <p className="mt-1 line-clamp-3 text-sm leading-6 text-muted-foreground">
                        {product.description || "Описание продукта пока не заполнено."}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                      {product.target_duration_seconds} сек
                    </span>
                  </div>
                  {product.product_refs.length ? (
                    <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-primary">
                      <ImageIcon className="h-4 w-4" />
                      {product.product_refs.length} ref
                    </div>
                  ) : null}
                </button>
              );
            })}
            {!products.length && !productsQuery.isLoading ? (
              <div className="rounded-lg border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
                Продукты еще не добавлены.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <aside className="space-y-5">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <PackagePlus className="h-4 w-4 text-primary" />
            Новый продукт
          </div>
          <div className="grid gap-3">
            <Input
              value={productDraft.name}
              onChange={(event) => setProductDraft({ ...productDraft, name: event.target.value })}
              placeholder="Название продукта"
              className="h-11"
            />
            <textarea
              value={productDraft.description}
              onChange={(event) => setProductDraft({ ...productDraft, description: event.target.value })}
              placeholder="Описание продукта"
              className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Input
              value={productDraft.referenceUrl}
              onChange={(event) => setProductDraft({ ...productDraft, referenceUrl: event.target.value })}
              placeholder="S3/ref URL продукта"
              className="h-11"
            />
            <Button type="button" onClick={() => void handleCreateProduct()} disabled={!canCreateProduct} className="min-h-11">
              <Package className="h-4 w-4" />
              Добавить продукт
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground">Активный продукт</p>
          {activeProduct ? (
            <div className="mt-3 space-y-3">
              <h4 className="text-lg font-semibold text-foreground">{activeProduct.name}</h4>
              <p className="text-sm leading-6 text-muted-foreground">
                {activeProduct.description || "Описание продукта пока не заполнено."}
              </p>
              {activeProduct.product_refs.map((ref) => (
                <a
                  key={ref.id}
                  href={ref.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate rounded-lg border border-border bg-background px-3 py-2 text-sm text-primary transition hover:bg-muted/40"
                >
                  {ref.label || ref.url}
                </a>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Выберите продукт из списка или создайте новый.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function ClientProfileCard({
  project,
  isSaving,
  onSave,
}: {
  project: { name: string; target_audience: string | null; brand_voice: string | null };
  isSaving: boolean;
  onSave: (targetAudience: string, brandVoice: string) => void;
}) {
  const [targetAudience, setTargetAudience] = useState(project.target_audience || "");
  const [brandVoice, setBrandVoice] = useState(project.brand_voice || "");
  const hasProfileChanges =
    targetAudience.trim() !== (project.target_audience || "") || brandVoice.trim() !== (project.brand_voice || "");

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Клиент</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{project.name}</h2>
        </div>
        <Button
          type="button"
          onClick={() => onSave(targetAudience, brandVoice)}
          disabled={!hasProfileChanges || isSaving}
          className="min-h-10"
        >
          <Save className="h-4 w-4" />
          {isSaving ? "Сохраняю" : "Сохранить"}
        </Button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Tone of voice
          <textarea
            value={brandVoice}
            onChange={(event) => setBrandVoice(event.target.value)}
            rows={7}
            className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal normal-case leading-6 tracking-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Как должен звучать бренд: спокойный, экспертный, поддерживающий..."
          />
        </label>
        <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Целевая аудитория
          <textarea
            value={targetAudience}
            onChange={(event) => setTargetAudience(event.target.value)}
            rows={7}
            className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal normal-case leading-6 tracking-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Кто покупает продукт, какие боли, уровень осведомленности, ограничения..."
          />
        </label>
      </div>
    </div>
  );
}
