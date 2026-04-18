import type { ReactNode } from 'react';
import { Loader2, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface ReviewEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientEmail: string;
  subject: string;
  message: string;
  onSubjectChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onSend: () => void;
  sending?: boolean;
  disableSend?: boolean;
  title?: string;
  description?: string;
  recipientLabel?: string;
  subjectLabel?: string;
  messageLabel?: string;
  messagePlaceholder?: string;
  messageRows?: number;
  sendLabel?: string;
  cancelLabel?: string;
  children?: ReactNode;
}

export default function ReviewEmailDialog({
  open,
  onOpenChange,
  recipientEmail,
  subject,
  message,
  onSubjectChange,
  onMessageChange,
  onSend,
  sending = false,
  disableSend = false,
  title = 'Review Email',
  description = 'Review and send an email to the hospital contact.',
  recipientLabel = 'Recipient Email',
  subjectLabel = 'Subject',
  messageLabel = 'Message',
  messagePlaceholder = 'Write your review message...',
  messageRows = 7,
  sendLabel = 'Send Review Email',
  cancelLabel = 'Cancel',
  children,
}: ReviewEmailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1">
            <Label htmlFor="review-dialog-recipient">{recipientLabel}</Label>
            <Input
              id="review-dialog-recipient"
              value={recipientEmail}
              readOnly
              placeholder="No recipient email available"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="review-dialog-subject">{subjectLabel}</Label>
            <Input
              id="review-dialog-subject"
              value={subject}
              onChange={(event) => onSubjectChange(event.target.value)}
              placeholder="Registration Review Required"
            />
          </div>

          {children}

          <div className="space-y-1">
            <Label htmlFor="review-dialog-message">{messageLabel}</Label>
            <Textarea
              id="review-dialog-message"
              value={message}
              onChange={(event) => onMessageChange(event.target.value)}
              rows={messageRows}
              placeholder={messagePlaceholder}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button type="button" onClick={onSend} disabled={sending || disableSend}>
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                {sendLabel}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
