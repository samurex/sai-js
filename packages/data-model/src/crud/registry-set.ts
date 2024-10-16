import { AuthorizationAgentFactory } from '..';
import { CRUDResource, CRUDDataRegistry, CRUDAgentRegistry, CRUDAuthorizationRegistry } from '.';
import { DataFactory } from 'n3';
import { INTEROP, RDF } from '@janeirodigital/interop-utils';

export type CRUDRegistrySetData = {
  hasAuthorizationRegistry: string;
  hasAgentRegistry: string;
  hasDataRegistry: string[];
};

export class CRUDRegistrySet extends CRUDResource {
  declare factory: AuthorizationAgentFactory;

  declare data?: CRUDRegistrySetData;

  hasAuthorizationRegistry: CRUDAuthorizationRegistry;

  hasAgentRegistry: CRUDAgentRegistry;

  hasDataRegistry: CRUDDataRegistry[];

  private async bootstrap(): Promise<void> {
    if (this.data) {
      this.dataset.add(DataFactory.quad(this.node, RDF.type, INTEROP.RegistrySet));
      this.dataset.add(
        DataFactory.quad(this.node, INTEROP.hasAgentRegistry, DataFactory.namedNode(this.data.hasAgentRegistry))
      );
      this.dataset.add(
        DataFactory.quad(
          this.node,
          INTEROP.hasAuthorizationRegistry,
          DataFactory.namedNode(this.data.hasAuthorizationRegistry)
        )
      );
      for (const id of this.data.hasDataRegistry) {
        this.dataset.add(DataFactory.quad(this.node, INTEROP.hasDataRegistry, DataFactory.namedNode(id)));
      }
    } else {
      await this.fetchData();
      this.hasAuthorizationRegistry = await this.factory.crud.authorizationRegistry(
        this.getObject('hasAuthorizationRegistry').value
      );
      this.hasAgentRegistry = await this.factory.crud.agentRegistry(this.getObject('hasAgentRegistry').value);
      const dataRegistryIris = this.getObjectsArray('hasDataRegistry').map((object) => object.value);
      this.hasDataRegistry = await Promise.all(dataRegistryIris.map((iri) => this.factory.crud.dataRegistry(iri)));
    }
  }

  public static async build(
    iri: string,
    factory: AuthorizationAgentFactory,
    data?: CRUDRegistrySetData
  ): Promise<CRUDRegistrySet> {
    const instance = new CRUDRegistrySet(iri, factory, data);
    await instance.bootstrap();
    return instance;
  }
}
