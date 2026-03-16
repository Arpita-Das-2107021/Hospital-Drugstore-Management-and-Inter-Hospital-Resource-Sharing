import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface CompatibilityItem {
  id: string;
  label: string;
  labelBn?: string;
  description?: string;
  required: boolean;
  warning?: string;
}

interface CompatibilityChecklistProps {
  resourceType: 'blood' | 'drugs' | 'organs' | 'equipment';
  checkedItems: string[];
  onCheckChange: (itemId: string, checked: boolean) => void;
}

const checklistItems: Record<string, CompatibilityItem[]> = {
  blood: [
    { id: 'blood_type_verified', label: 'Blood type verified', labelBn: 'রক্তের গ্রুপ যাচাই করা হয়েছে', required: true },
    { id: 'cross_match_done', label: 'Cross-match completed', labelBn: 'ক্রস-ম্যাচ সম্পন্ন', required: true, warning: 'Must be completed within 72 hours of transfusion' },
    { id: 'patient_id_confirmed', label: 'Patient ID confirmed', labelBn: 'রোগীর পরিচয় নিশ্চিত', required: true },
    { id: 'no_transfusion_reactions', label: 'No prior transfusion reactions', labelBn: 'পূর্বে কোনো রক্ত সঞ্চালন প্রতিক্রিয়া নেই', required: false },
    { id: 'consent_obtained', label: 'Patient/family consent obtained', labelBn: 'রোগী/পরিবারের সম্মতি প্রাপ্ত', required: true },
  ],
  drugs: [
    { id: 'allergy_check', label: 'Allergy check completed', labelBn: 'এলার্জি পরীক্ষা সম্পন্ন', required: true },
    { id: 'drug_interactions', label: 'Drug interactions reviewed', labelBn: 'ওষুধের মিথস্ক্রিয়া পর্যালোচনা করা হয়েছে', required: true },
    { id: 'dosage_verified', label: 'Dosage appropriate for patient', labelBn: 'রোগীর জন্য ডোজ উপযুক্ত', required: true },
    { id: 'storage_conditions', label: 'Storage requirements met', labelBn: 'স্টোরেজ প্রয়োজনীয়তা পূরণ', required: false },
    { id: 'generic_substitute_ok', label: 'Generic substitution acceptable', labelBn: 'জেনেরিক প্রতিস্থাপন গ্রহণযোগ্য', required: false },
  ],
  organs: [
    { id: 'hla_match', label: 'HLA matching confirmed', labelBn: 'এইচএলএ ম্যাচিং নিশ্চিত', required: true, warning: 'Critical for transplant success' },
    { id: 'blood_type_compatible', label: 'Blood type compatible', labelBn: 'রক্তের গ্রুপ সামঞ্জস্যপূর্ণ', required: true },
    { id: 'surgical_team_ready', label: 'Surgical team available', labelBn: 'সার্জিক্যাল টিম উপলব্ধ', required: true },
    { id: 'ischemia_time_acceptable', label: 'Cold ischemia time acceptable', labelBn: 'কোল্ড ইস্কেমিয়া সময় গ্রহণযোগ্য', required: true, warning: 'Time-critical - verify before confirming' },
    { id: 'recipient_prepared', label: 'Recipient medically prepared', labelBn: 'গ্রহীতা চিকিৎসাগতভাবে প্রস্তুত', required: true },
  ],
  equipment: [
    { id: 'power_requirements', label: 'Power requirements verified', labelBn: 'বিদ্যুৎ প্রয়োজনীয়তা যাচাই করা হয়েছে', required: true },
    { id: 'space_available', label: 'Installation space available', labelBn: 'ইনস্টলেশন স্পেস উপলব্ধ', required: true },
    { id: 'trained_staff', label: 'Trained staff available', labelBn: 'প্রশিক্ষিত কর্মী উপলব্ধ', required: true },
    { id: 'calibration_current', label: 'Calibration current', labelBn: 'ক্যালিব্রেশন বর্তমান', required: false },
    { id: 'consumables_available', label: 'Required consumables in stock', labelBn: 'প্রয়োজনীয় কনজিউমেবল স্টকে আছে', required: false },
  ],
};

export const CompatibilityChecklist = ({
  resourceType,
  checkedItems,
  onCheckChange,
}: CompatibilityChecklistProps) => {
  const items = checklistItems[resourceType] || [];
  const requiredItems = items.filter(i => i.required);
  const optionalItems = items.filter(i => !i.required);
  
  const requiredChecked = requiredItems.filter(i => checkedItems.includes(i.id)).length;
  const allRequiredChecked = requiredChecked === requiredItems.length;

  return (
    <div className="space-y-4">
      {/* Progress Header */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
        <div className="flex items-center gap-2">
          {allRequiredChecked ? (
            <CheckCircle className="h-5 w-5 text-success" />
          ) : (
            <Info className="h-5 w-5 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">Compatibility Check</span>
        </div>
        <Badge variant={allRequiredChecked ? "default" : "secondary"} className={allRequiredChecked ? "bg-success" : ""}>
          {requiredChecked}/{requiredItems.length} Required
        </Badge>
      </div>

      {/* Required Items */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Required Checks</p>
        {requiredItems.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border transition-colors",
              checkedItems.includes(item.id) 
                ? "bg-success/5 border-success/30" 
                : "bg-muted/30 border-border hover:border-primary/30"
            )}
          >
            <Checkbox
              id={item.id}
              checked={checkedItems.includes(item.id)}
              onCheckedChange={(checked) => onCheckChange(item.id, checked as boolean)}
              className="mt-0.5"
            />
            <div className="flex-1 space-y-1">
              <Label htmlFor={item.id} className="cursor-pointer font-medium">
                {item.label}
                <span className="text-destructive ml-1">*</span>
              </Label>
              {item.warning && (
                <div className="flex items-center gap-1.5 text-xs text-warning">
                  <AlertTriangle className="h-3 w-3" />
                  {item.warning}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Optional Items */}
      {optionalItems.length > 0 && (
        <div className="space-y-2 pt-2 border-t">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Optional Checks</p>
          {optionalItems.map((item) => (
            <div
              key={item.id}
              className={cn(
                "flex items-start gap-3 p-2 rounded-lg transition-colors",
                checkedItems.includes(item.id) 
                  ? "bg-muted/50" 
                  : "hover:bg-muted/30"
              )}
            >
              <Checkbox
                id={item.id}
                checked={checkedItems.includes(item.id)}
                onCheckedChange={(checked) => onCheckChange(item.id, checked as boolean)}
              />
              <Label htmlFor={item.id} className="cursor-pointer text-sm">
                {item.label}
              </Label>
            </div>
          ))}
        </div>
      )}

      {/* Validation Message */}
      {!allRequiredChecked && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <p className="text-sm text-warning">
            All required checks must be completed before submitting the request
          </p>
        </div>
      )}
    </div>
  );
};

export default CompatibilityChecklist;
