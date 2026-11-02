/** Editor de un director (nombre y sexo): se abre al tocar su etiqueta; en XR se escribe con el teclado de la mesa. */
const MAX_NAME = 40;

class AgentEditor {
  open = false;
  agentId = '';
  name = '';
  female = true;
  error = '';
  saving = false;
  version = 0;
  onChange: () => void = () => {};
  /** guarda en el servidor; lo pone Boardroom */
  save: ((id: string, name: string, female: boolean) => Promise<void>) | null = null;

  openFor(id: string, name: string, female: boolean): void {
    this.open = true;
    this.agentId = id;
    this.name = name;
    this.female = female;
    this.error = '';
    this.saving = false;
    this.changed();
  }

  type(ch: string): void {
    if (!/^[\p{L}' .-]$/u.test(ch) || this.name.length >= MAX_NAME) return;
    this.name += ch;
    this.error = '';
    this.changed();
  }

  setName(name: string): void {
    this.name = name.slice(0, MAX_NAME);
    this.error = '';
    this.version++;
  }

  backspace(): void {
    this.name = Array.from(this.name).slice(0, -1).join('');
    this.changed();
  }

  setFemale(female: boolean): void {
    this.female = female;
    this.changed();
  }

  cancel(): void {
    this.open = false;
    this.changed();
  }

  /** Guarda nombre y sexo; si el servidor lo rechaza (p. ej. nombre repetido) el editor sigue abierto con el motivo. */
  async commit(): Promise<void> {
    const name = this.name.trim().replace(/\s+/g, ' ');
    if (!name) {
      this.error = 'The name cannot be empty.';
      return this.changed();
    }
    if (this.saving || !this.save) return;
    this.saving = true;
    this.error = '';
    this.changed();
    try {
      await this.save(this.agentId, name, this.female);
      this.open = false;
    } catch (e) {
      this.error = (e as Error).message;
    }
    this.saving = false;
    this.changed();
  }

  private changed(): void {
    this.version++;
    this.onChange();
  }
}

export const agentEditor = new AgentEditor();
