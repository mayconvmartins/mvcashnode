'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { adminService } from '@/lib/api/admin.service';

const planSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  description: z.string().optional(),
  price_monthly: z.number().min(0.01, 'Preço mensal deve ser maior que zero'),
  price_quarterly: z.number().min(0.01, 'Preço trimestral deve ser maior que zero'),
  duration_days: z.number().min(1).max(365),
  is_active: z.boolean().optional().default(true),
  features_json: z.any().optional(),
});

type PlanFormData = z.infer<typeof planSchema>;

interface PlanFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan?: any;
  onSuccess: () => void;
}

export function PlanForm({ open, onOpenChange, plan, onSuccess }: PlanFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [features, setFeatures] = useState<string[]>(plan?.features_json || []);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<PlanFormData>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: plan?.name || '',
      description: plan?.description || '',
      price_monthly: plan?.price_monthly ? Number(plan.price_monthly) : 0,
      price_quarterly: plan?.price_quarterly ? Number(plan.price_quarterly) : 0,
      duration_days: plan?.duration_days || 30,
      is_active: plan?.is_active ?? true,
      features_json: plan?.features_json || [],
    },
  });

  useEffect(() => {
    if (plan) {
      reset({
        name: plan.name || '',
        description: plan.description || '',
        price_monthly: plan.price_monthly ? Number(plan.price_monthly) : 0,
        price_quarterly: plan.price_quarterly ? Number(plan.price_quarterly) : 0,
        duration_days: plan.duration_days || 30,
        is_active: plan.is_active ?? true,
        features_json: plan.features_json || [],
      });
      setFeatures(Array.isArray(plan.features_json) ? plan.features_json : []);
    } else {
      reset({
        name: '',
        description: '',
        price_monthly: 0,
        price_quarterly: 0,
        duration_days: 30,
        is_active: true,
        features_json: [],
      });
      setFeatures([]);
    }
  }, [plan, reset]);

  const addFeature = () => {
    setFeatures([...features, '']);
  };

  const updateFeature = (index: number, value: string) => {
    const newFeatures = [...features];
    newFeatures[index] = value;
    setFeatures(newFeatures);
  };

  const removeFeature = (index: number) => {
    setFeatures(features.filter((_, i) => i !== index));
  };

  const onSubmit = async (data: PlanFormData) => {
    setIsSubmitting(true);
    try {
      const planData = {
        ...data,
        features_json: features.filter((f) => f.trim().length > 0),
      };

      if (plan) {
        await adminService.updateSubscriptionPlan(plan.id, planData);
        toast.success('Plano atualizado com sucesso!');
      } else {
        await adminService.createSubscriptionPlan(planData);
        toast.success('Plano criado com sucesso!');
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Erro ao salvar plano');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plan ? 'Editar Plano' : 'Criar Novo Plano'}</DialogTitle>
          <DialogDescription>
            Configure os detalhes do plano de assinatura
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Plano *</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="Plano Básico"
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Descrição do plano..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price_monthly">Preço Mensal (R$) *</Label>
              <Input
                id="price_monthly"
                type="number"
                step="0.01"
                min="0"
                {...register('price_monthly', { valueAsNumber: true })}
                placeholder="0.00"
              />
              {errors.price_monthly && (
                <p className="text-sm text-red-500">{errors.price_monthly.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="price_quarterly">Preço Trimestral (R$) *</Label>
              <Input
                id="price_quarterly"
                type="number"
                step="0.01"
                min="0"
                {...register('price_quarterly', { valueAsNumber: true })}
                placeholder="0.00"
              />
              {errors.price_quarterly && (
                <p className="text-sm text-red-500">{errors.price_quarterly.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration_days">Duração (dias) *</Label>
            <Input
              id="duration_days"
              type="number"
              min="1"
              max="365"
              {...register('duration_days', { valueAsNumber: true })}
              placeholder="30"
            />
            <p className="text-xs text-muted-foreground">
              Duração do plano em dias (30 para mensal, 90 para trimestral)
            </p>
            {errors.duration_days && (
              <p className="text-sm text-red-500">{errors.duration_days.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Recursos do Plano</Label>
            <div className="space-y-2">
              {features.map((feature, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={feature}
                    onChange={(e) => updateFeature(index, e.target.value)}
                    placeholder="Ex: Acesso completo à plataforma"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeFeature(index)}
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={addFeature}
                className="w-full"
              >
                + Adicionar Recurso
              </Button>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="is_active"
              checked={watch('is_active')}
              onCheckedChange={(checked) => setValue('is_active', checked)}
            />
            <Label htmlFor="is_active" className="cursor-pointer">
              Plano ativo
            </Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Salvando...
                </>
              ) : (
                plan ? 'Atualizar' : 'Criar'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
