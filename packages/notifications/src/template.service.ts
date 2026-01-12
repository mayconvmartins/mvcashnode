export interface TemplateVariables {
  [key: string]: any;
}

export class TemplateService {
  /**
   * Renderiza um template substituindo variáveis pelo formato {variavel} ou {{variavel}}
   * Suporta ambos os formatos para compatibilidade com templates de WhatsApp ({var}) e Email ({{var}})
   */
  renderTemplate(template: string, variables: TemplateVariables): string {
    let rendered = template;

    // Substituir todas as variáveis no formato {{variavel}} (chaves duplas - usado em templates de email)
    // e {variavel} (chaves simples - usado em templates de WhatsApp)
    for (const [key, value] of Object.entries(variables)) {
      const formattedValue = this.formatValue(value);
      
      // Primeiro substituir {{variavel}} (chaves duplas)
      const doubleRegex = new RegExp(`\\{\\{${this.escapeRegex(key)}\\}\\}`, 'g');
      rendered = rendered.replace(doubleRegex, formattedValue);
      
      // Depois substituir {variavel} (chaves simples)
      const singleRegex = new RegExp(`\\{${this.escapeRegex(key)}\\}`, 'g');
      rendered = rendered.replace(singleRegex, formattedValue);
    }

    return rendered;
  }

  /**
   * Escapa caracteres especiais de regex em uma string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Formata valores baseado no tipo
   */
  private formatValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    // Se for número, formatar como decimal brasileiro
    if (typeof value === 'number') {
      // Verificar se é um número muito pequeno (provavelmente decimal)
      if (value < 1 && value > 0) {
        return value.toFixed(8).replace(/\.?0+$/, '');
      }
      // Números maiores, formatar com separador de milhar
      return value.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 8,
      });
    }

    // Se for data
    if (value instanceof Date) {
      return this.formatDate(value);
    }

    // Se for string de data ISO
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return this.formatDate(new Date(value));
    }

    return String(value);
  }

  /**
   * Formata data em pt-BR
   */
  private formatDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Extrai variáveis do template (suporta {var} e {{var}})
   */
  extractVariables(template: string): string[] {
    // Regex que captura tanto {{variavel}} quanto {variavel}
    // Mas ignora sintaxe Handlebars como {{#if}} ou {{/if}}
    const doubleRegex = /\{\{([^#/}][^}]*)\}\}/g;
    const singleRegex = /\{([^{][^}]*)\}/g;
    const variables: string[] = [];
    let match;

    // Extrair variáveis com chaves duplas {{var}}
    while ((match = doubleRegex.exec(template)) !== null) {
      const varName = match[1].trim();
      if (varName && !variables.includes(varName) && !varName.startsWith('#') && !varName.startsWith('/')) {
        variables.push(varName);
      }
    }

    // Extrair variáveis com chaves simples {var}
    while ((match = singleRegex.exec(template)) !== null) {
      const varName = match[1].trim();
      if (varName && !variables.includes(varName)) {
        variables.push(varName);
      }
    }

    return variables;
  }

  /**
   * Valida se todas as variáveis do template estão presentes
   */
  validateVariables(template: string, providedVariables: TemplateVariables): {
    valid: boolean;
    missing: string[];
  } {
    const required = this.extractVariables(template);
    const provided = Object.keys(providedVariables);
    const missing = required.filter(v => !provided.includes(v));

    return {
      valid: missing.length === 0,
      missing,
    };
  }
}

