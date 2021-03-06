import {expect} from 'chai';
import sinon from 'sinon';

import expectError from '../../../../infra/testing/expectError';

import {fetchWrapper} from '../../../../packages/workbox-core/_private/fetchWrapper.mjs';

describe(`workbox-core fetchWrapper`, function() {
  let sandbox;

  before(function() {
    sandbox = sinon.createSandbox();
  });

  afterEach(function() {
    sandbox.restore();
  });

  describe(`.fetch()`, function() {
    // TODO Add Error Case Tests (I.e. bad input)

    it(`should work with string`, async function() {
      const stub = sandbox.stub(global, 'fetch').callsFake(() => new Response());

      await fetchWrapper.fetch('/test/string');

      expect(stub.callCount).to.equal(1);
      const fetchRequest = stub.args[0][0];
      expect(fetchRequest.url).to.equal('/test/string');
    });

    it(`should work with Request`, async function() {
      const stub = sandbox.stub(global, 'fetch').callsFake(() => new Response());

      await fetchWrapper.fetch(new Request('/test/request'));

      expect(stub.callCount).to.equal(1);
      const fetchRequest = stub.args[0][0];
      expect(fetchRequest.url).to.equal('/test/request');
    });

    it(`should use fetchOptions`, async function() {
      const stub = sandbox.stub(global, 'fetch').callsFake(() => new Response());

      const exampleOptions = {
        method: 'Post',
        headers: {
          'Custom': 'Header',
        },
        body: 'Example Body',
      };
      await fetchWrapper.fetch('/test/fetchOptions', exampleOptions);

      expect(stub.callCount).to.equal(1);
      const fetchRequest = stub.args[0][0];
      expect(fetchRequest.url).to.equal('/test/fetchOptions');
      const fetchOptions = stub.args[0][1];
      expect(fetchOptions).to.deep.equal(exampleOptions);
    });

    it(`should call requestWillFetch method in plugins and use the returned request`, async function() {
      const fetchStub = sandbox.stub(global, 'fetch').callsFake(() => new Response());
      const firstPlugin = {
        requestWillFetch: (request) => {
          return new Request('/test/requestWillFetch/1');
        },
      };

      const secondPlugin = {
        requestWillFetch: (request) => {
          return new Request('/test/requestWillFetch/2');
        },
      };

      const spyOne = sandbox.spy(firstPlugin, 'requestWillFetch');
      const spyTwo = sandbox.spy(secondPlugin, 'requestWillFetch');

      await fetchWrapper.fetch('/test/requestWillFetch/0', null, [
        firstPlugin,
        {
          // It should be able to handle plugins without the required method.
        },
        secondPlugin,
      ]);

      expect(spyOne.callCount).equal(1);
      expect(spyTwo.callCount).equal(1);
      expect(fetchStub.callCount).to.equal(1);

      const fetchRequest = fetchStub.args[0][0];
      expect(fetchRequest.url).to.equal('/test/requestWillFetch/2');
    });

    it(`should throw a meaningful error on bad requestWillFetch plugin`, async function() {
      const fetchStub = sandbox.stub(global, 'fetch').callsFake(() => new Response());
      const errorPlugin = {
        requestWillFetch: (request) => {
          throw new Error('Injected Error from Test.');
        },
      };
      const errorPluginSpy = sandbox.spy(errorPlugin, 'requestWillFetch');

      await expectError(() => {
        return fetchWrapper.fetch('/test/requestWillFetch/0', null, [
          errorPlugin,
        ]);
      }, 'plugin-error-request-will-fetch', (err) => {
        expect(err.details.thrownError).to.exist;
        expect(err.details.thrownError.message).to.equal('Injected Error from Test.');
      });

      expect(errorPluginSpy.callCount).equal(1);
      expect(fetchStub.callCount).to.equal(0);
    });

    it(`should call fetchDidFail method in plugins`, async function() {
      sandbox.stub(global, 'fetch').callsFake(() => {
        return Promise.reject(new Error('Injected Error.'));
      });

      const secondPlugin = {
        fetchDidFail: ({originalRequest, request, error}) => {
          expect(originalRequest.url).to.equal('/test/failingRequest/0');
          expect(request.url).to.equal('/test/failingRequest/1');
          expect(error.message).to.equal('Injected Error.');
        },
      };
      const spyTwo = sandbox.spy(secondPlugin, 'fetchDidFail');

      const firstPlugin = {
        requestWillFetch: ({request}) => {
          return new Request('/test/failingRequest/1');
        },
        fetchDidFail: ({originalRequest, request, error}) => {
          // This should be called first
          expect(spyTwo.callCount).to.equal(0);
          expect(originalRequest.url).to.equal('/test/failingRequest/0');
          expect(request.url).to.equal('/test/failingRequest/1');
          expect(error.message).to.equal('Injected Error.');
        },
      };
      const spyOne = sandbox.spy(firstPlugin, 'fetchDidFail');

      try {
        await fetchWrapper.fetch('/test/failingRequest/0', null, [
          firstPlugin,
          {
            // It should be able to handle plugins without the required method.
          },
          secondPlugin,
        ]);
        throw new Error('No error thrown when it was expected.');
      } catch (err) {
        expect(err.message).to.equal('Injected Error.');
      }

      expect(spyOne.callCount).equal(1);
      expect(spyTwo.callCount).equal(1);
      expect(global.fetch.callCount).to.equal(1);

      const fetchRequest = global.fetch.args[0][0];
      expect(fetchRequest.url).to.equal('/test/failingRequest/1');
    });
  });
});
