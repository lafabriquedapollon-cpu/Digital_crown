# -*- coding: utf-8 -*-
import os
from datetime import datetime, date
from reportlab.lib import colors
from reportlab.lib.pagesizes import A5
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT, TA_JUSTIFY

from backend.services.base_template import BaseTemplate, NAVY_BLUE, PinnedCloture


class OrdonnanceGenerator:
    def __init__(self, output_dir="static/documents"):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)
        self.base_template = BaseTemplate()
        self.styles = getSampleStyleSheet()

    def _calculate_age(self, born):
        if not born:
            return 0
        today = date.today()
        birth = born.date() if isinstance(born, datetime) else born
        return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))

    def _get_save_path(self, patient, data):
        now = datetime.now()
        date_str = now.strftime('%Y%m%d_%H%M%S')
        save_dir = os.path.join(self.output_dir, now.strftime('%Y'), now.strftime('%m'))
        os.makedirs(save_dir, exist_ok=True)
        safe_name = f"{patient.nom.upper()}_{patient.prenom.capitalize()}".replace(" ", "_")
        filename = f"ORDONNANCE_{safe_name}_{date_str}.pdf"
        return os.path.join(save_dir, filename)

    def _draw_canvas(self, canvas, doc, config=None, user=None):
        self.base_template.draw_static_elements(canvas, doc, config=config, draw_legal_ids=False, user=user)

    def _create_header(self, patient, data, p_color, config=None):
        doc_date = getattr(data, 'doc_date', date.today())
        if isinstance(doc_date, str):
            try:
                doc_date = datetime.strptime(doc_date, '%Y-%m-%d').date()
            except Exception:
                doc_date = date.today()

        current_date = doc_date.strftime('%d/%m/%Y')
        age = self._calculate_age(patient.date_naissance)

        font_name = self.base_template.premium_font
        font_bold = self.base_template.premium_bold

        patient_style = ParagraphStyle(
            name='PatientInfo',
            parent=self.styles['Normal'],
            fontName=font_bold,
            fontSize=11,
            textColor=p_color,
            leading=14,
        )
        style_right = ParagraphStyle(
            'DocDate',
            parent=self.styles['Normal'],
            alignment=TA_RIGHT,
            textColor=p_color,
            fontName=font_name,
            fontSize=11,
        )

        patient_text = f"<b>{patient.nom.upper()} {patient.prenom.capitalize()}, {age} ans</b>"
        patient_w = 7.5 * cm
        adaptive_patient_style = self.base_template.get_adaptive_style(patient_style, patient_text, patient_w - 0.2*cm)
        
        header_content = [[
            Paragraph(patient_text, adaptive_patient_style),
            Paragraph(f"Le : <u>{current_date}</u>", style_right),
        ]]

        header_table = Table(header_content, colWidths=[7.5 * cm, 4.3 * cm])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOTTOMPADDING', (0, 0), (-1,-1), 12),
        ]))
        return header_table

    def _get_val(self, obj, key, default=None):
        if obj is None: return default
        if isinstance(obj, dict):
            return obj.get(key, default)
        return getattr(obj, key, default)

    def generate(self, patient, data, db=None, user_id=None, custom_config=None):
        filepath = self._get_save_path(patient, data)

        config = None
        user_obj = None
        if db and user_id:
            from backend.models import CabinetConfig, User
            db_config = db.query(CabinetConfig).filter(CabinetConfig.owner_id == user_id).first()
            user_obj = db.query(User).filter(User.id == user_id).first()
            
            if db_config:
                config = {}
                for col in db_config.__table__.columns:
                    config[col.name] = getattr(db_config, col.name)
                if custom_config:
                    for k, v in custom_config.items():
                        if v is not None:
                            config[k] = v
            else:
                config = custom_config
        else:
            config = custom_config

        p_color = colors.HexColor(self._get_val(config, 'primary_color', '#003380'))
        self.base_template.update_active_fonts(config)

        p_width_val = A5[0]
        m_top, m_bottom, m_left, m_right = self.base_template.get_document_margins(config, p_width_val)

        # Single-Page Force : on essaie avec un facteur de compression croissant
        # jusqu'à ce que tout tienne sur 1 page.
        compression_factor = 1.0
        max_attempts = 8
        
        for attempt in range(max_attempts):
            elements = self._build_elements(patient, data, config, p_color, compression_factor)
            
            doc = SimpleDocTemplate(
                filepath, pagesize=A5,
                rightMargin=m_right, leftMargin=m_left,
                topMargin=m_top, bottomMargin=m_bottom,
            )
            doc.qr_type = 'VALIDATION'
            doc.doc_id = getattr(data, 'id', 'ORD-TEMP')
            doc.cloture_text = None

            draw_method = lambda canv, d: self._draw_canvas(canv, d, config=config, user=user_obj)
            
            # Compteur de pages
            page_counter = _PageCounter()
            doc.build(elements, onFirstPage=draw_method, onLaterPages=draw_method, canvasmaker=page_counter.make_canvas_class())

            if page_counter.page_count <= 1:
                break  # Tout tient sur 1 page
            
            # Sinon, on compresse davantage et on réessaie
            compression_factor *= 0.82
            if compression_factor < 0.3:
                break  # Seuil plancher atteint

        return filepath.replace("\\", "/")

    def _build_elements(self, patient, data, config, p_color, compression_factor):
        """Construit la liste d'éléments Platypus avec le facteur de compression donné."""
        font_name = self.base_template.premium_font
        font_bold = self.base_template.premium_bold

        title_fs = max(18 * compression_factor, 12)
        title_style = ParagraphStyle(
            name='TitleA5',
            parent=self.styles['Normal'],
            fontName=font_bold,
            fontSize=title_fs,
            textColor=p_color,
            alignment=TA_CENTER,
            spaceAfter=max(20 * compression_factor, 6),
        )

        spacer_top = max(0.4 * cm * compression_factor, 0.1 * cm)
        spacer_mid = max(0.6 * cm * compression_factor, 0.1 * cm)
        spacer_body = max(1.2 * cm * compression_factor, 0.3 * cm)

        elements = [
            Spacer(1, spacer_top),
            Paragraph("<u><b>ORDONNANCE</b></u>", title_style),
            Spacer(1, spacer_mid),
            self._create_header(patient, data, p_color, config),
            Spacer(1, spacer_body),
        ]

        if hasattr(data, 'medications') and data.medications:
            med_font = self.base_template.premium_font
            med_font_bold = self.base_template.premium_bold

            num_meds = len(data.medications)
            
            base_med_fs = 13 * compression_factor
            base_form_fs = 11 * compression_factor
            base_poso_fs = 12 * compression_factor

            # Pré-calcul global des tailles minimales pour homogénéité
            min_name_fs = base_med_fs
            min_form_fs = base_form_fs
            min_dose_fs = base_form_fs
            
            for i, med in enumerate(data.medications, 1):
                nom = getattr(med, 'nom', '') or ""
                forme = getattr(med, 'forme', '') or ""
                dose = getattr(med, 'dosage', '') or ""
                
                name_text = f"{i}- <b>{nom.upper()}</b>"
                name_text_nbsp = name_text.replace(" ", "\u00a0")
                name_w = 7.0*cm
                name_fs = self.base_template.get_adaptive_font_size(name_text_nbsp, med_font_bold, base_med_fs, name_w - 0.5*cm)
                if name_fs < min_name_fs:
                    min_name_fs = name_fs
                    
                display_forme = forme.replace('AUTRE: ', '').replace('Autre: ', '') if forme else ""
                if display_forme:
                    form_w = 3.0*cm
                    display_forme_nbsp = display_forme.replace(" ", "\u00a0")
                    form_fs = self.base_template.get_adaptive_font_size(f"<i>{display_forme_nbsp}</i>", med_font, base_form_fs, form_w - 0.2*cm)
                    if form_fs < min_form_fs:
                        min_form_fs = form_fs
                        
                if dose:
                    dose_w = 1.8*cm
                    dose_nbsp = dose.replace(" ", "\u00a0")
                    dose_fs = self.base_template.get_adaptive_font_size(dose_nbsp, med_font, base_form_fs, dose_w - 0.1*cm)
                    if dose_fs < min_dose_fs:
                        min_dose_fs = dose_fs

            med_name_style = ParagraphStyle('MedName', parent=self.styles['Normal'], fontName=med_font_bold, fontSize=min_name_fs, textColor=p_color)
            med_forme_style = ParagraphStyle('MedForme', parent=self.styles['Normal'], fontName=med_font, fontSize=min_form_fs, textColor=p_color, alignment=TA_CENTER)
            med_dose_style = ParagraphStyle('MedDose', parent=self.styles['Normal'], fontName=med_font, fontSize=min_dose_fs, textColor=p_color, alignment=TA_RIGHT)
            
            poso_leading = max(base_poso_fs * 1.2, 8)
            poso_space_after = max(8 * compression_factor, 2)
            poso_style = ParagraphStyle(
                'PosoElite', parent=self.styles['Normal'], fontName=med_font, fontSize=base_poso_fs,
                textColor=p_color, leftIndent=1.5*cm, spaceBefore=2, spaceAfter=poso_space_after,
                leading=poso_leading
            )
            
            warning_style = ParagraphStyle(
                'RadioWarning', parent=self.styles['Normal'], fontName=med_font, fontSize=max(10 * compression_factor, 6),
                textColor=colors.HexColor("#7F1D1D"), leftIndent=1.5*cm, spaceBefore=2, spaceAfter=poso_space_after,
                italic=True
            )

            for i, med in enumerate(data.medications, 1):
                forme = getattr(med, 'forme', '') or ""
                dose = getattr(med, 'dosage', '') or ""
                nom = getattr(med, 'nom', '') or ""
                posologie = getattr(med, 'posologie', '') or ""
                m_type = getattr(med, 'type', 'MEDICAMENT')

                is_radio = m_type == "EXAMEN" or "RADIO" in nom.upper() or "X-RAY" in nom.upper()
                display_forme = forme.replace('AUTRE: ', '').replace('Autre: ', '') if forme else ""
                
                cols = []
                col_widths = []

                name_text = f"{i}- <b>{nom.upper()}</b>"
                name_text_nbsp = name_text.replace(" ", "\u00a0")
                name_w = 7.0*cm
                cols.append(Paragraph(name_text_nbsp, med_name_style))
                col_widths.append(name_w)
                
                if not is_radio:
                    if display_forme:
                        form_w = 3.0*cm
                        display_forme_nbsp = display_forme.replace(" ", "\u00a0")
                        cols.append(Paragraph(f"<i>{display_forme_nbsp}</i>", med_forme_style))
                        col_widths.append(form_w)
                    else:
                        col_widths[0] += 1.0*cm
                        
                    if dose:
                        dose_w = 1.8*cm
                        dose_nbsp = dose.replace(" ", "\u00a0")
                        cols.append(Paragraph(f"{dose_nbsp}", med_dose_style))
                        col_widths.append(dose_w)
                    else:
                        col_widths[0] += 0.8*cm

                total_w = sum(col_widths)
                if total_w < 11.8*cm:
                    col_widths[0] += (11.8*cm - total_w)

                top_pad = max(12 * compression_factor, 2)
                med_line_table = Table([cols], colWidths=col_widths)
                med_line_table.setStyle(TableStyle([
                    ('VALIGN', (0,0), (-1,-1), 'BOTTOM'),
                    ('LEFTPADDING', (0,0), (-1,-1), 0),
                    ('RIGHTPADDING', (0,0), (-1,-1), 0),
                    ('TOPPADDING', (0,0), (-1,-1), top_pad),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 2),
                ]))
                
                elements.append(med_line_table)
                
                if is_radio:
                    show_legal = getattr(data, 'show_legal_annotations', True)
                    if show_legal:
                        warning_msg = "⚠️ Radioprotection : À réaliser selon les normes de sécurité en vigueur."
                        if posologie:
                            warning_msg += f"<br/>{posologie.replace(chr(10), '<br/>')}"
                        elements.append(Paragraph(warning_msg, warning_style))
                    elif posologie:
                        elements.append(Paragraph(posologie.replace("\n", "<br/>"), poso_style))
                elif posologie:
                    poso_html = posologie.replace("\n", "<br/>")
                    elements.append(Paragraph(poso_html, poso_style))
                else:
                    spacer_h = max(0.5 * compression_factor, 0.1)
                    elements.append(Spacer(1, spacer_h*cm))
        else:
            empty_style = ParagraphStyle(
                'Empty', parent=self.styles['Normal'],
                fontName=font_name, fontSize=10, textColor=p_color, alignment=TA_CENTER
            )
            elements.append(Paragraph("Aucun médicament prescrit.", empty_style))

        return elements


class _PageCounter:
    """Compteur de pages pour le mécanisme Single-Page Force."""
    def __init__(self):
        self.page_count = 0
    
    def make_canvas_class(self):
        counter = self
        from reportlab.pdfgen.canvas import Canvas
        class CountingCanvas(Canvas):
            def showPage(self_canvas):
                counter.page_count += 1
                super().showPage()
        return CountingCanvas

