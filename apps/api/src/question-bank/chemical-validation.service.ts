import type { ChemicalStructure } from '@bsbe/contracts';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class ChemicalValidationService {
  async validate(structure: ChemicalStructure | undefined): Promise<void> {
    if (!structure) return;
    try {
      const { Molecule } = await import('openchemlib');
      const molecule =
        structure.format === 'smiles'
          ? Molecule.fromSmiles(structure.source)
          : Molecule.fromMolfile(structure.source);
      const atoms = molecule.getAllAtoms();
      if (atoms < 1 || atoms > 500) throw new Error('Atom count is outside the supported range');
    } catch {
      throw new BadRequestException({
        code: 'CHEMICAL_STRUCTURE_INVALID',
        message: 'Chemical structure is invalid or exceeds 500 atoms',
      });
    }
  }
}
