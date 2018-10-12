import {boxFactory} from '../Box';
import {DataMessage, Message, MessageData, SentinelMessage} from '../Message';
import {BoxMeta, BoxInterface, BatchingBoxInterface} from '../BoxI';
import {PriorityQueueI} from '../queue/PriorityQueueI';
import {ServiceProvider} from '../ServiceProvider';

describe('Box', () => {
	describe('Mapper', () => {
		const MappingBox = boxFactory(
			'MapperTest',
			{
				requires: ['foo'],
				provides: ['bar'],
				emits: [],
				aggregates: false,
			} as BoxMeta,
			async function(
				serviceProvider: ServiceProvider,
				value: MessageData
			): Promise<MessageData> {
				const foo = value['foo'];
				return {bar: `${foo}!`, baz: "this value won't make it."};
			}
		);

		const setupFunction = (): {
			box: BoxInterface | BatchingBoxInterface;
			push: (arg: any) => void;
		} => {
			const outQ = {
				push: jest.fn(),
				length: 0,
				source: '__test',
				target: '__test',
			} as PriorityQueueI<Message>;

			const box = new MappingBox({} as ServiceProvider, outQ);
			return {box: box, push: outQ.push};
		};

		const scenarios = [
			(setups: {box: BoxInterface | BatchingBoxInterface; push: any}) =>
				it('Stores `provided` fields skips other.', async () => {
					const box = setups.box as BoxInterface;
					const pushMock = setups.push;
					const msg = new DataMessage({jobId: 'ttt', foo: 'hoo'});

					await box.process(msg);
					expect(pushMock).toHaveBeenCalledTimes(1);
					expect(pushMock).toHaveBeenCalledWith(msg);
					expect(
						msg.getInput(['jobId', 'foo', 'bar', 'baz'])
					).toEqual({
						jobId: 'ttt',
						foo: 'hoo',
						bar: 'hoo!',
						baz: undefined,
					});
				}),

			(setups: {box: BoxInterface | BatchingBoxInterface; push: any}) =>
				it('Sentinel value is passed.', async () => {
					const box: BoxInterface = setups.box as BoxInterface;
					const pushMock = setups.push;
					const parMsg = new DataMessage({jobId: '111'});
					const msg = new SentinelMessage(
						new Error('Sample of possible values.'),
						parMsg
					);

					await box.process(msg);
					expect(pushMock).toHaveBeenCalledWith(msg);
					expect(pushMock).toHaveBeenCalledTimes(1);
					expect(msg.finished).toEqual(true);
					expect(msg.data).toEqual(
						new Error('Sample of possible values.')
					);
				}),
		];

		scenarios.forEach((testFn) => testFn(setupFunction()));
	});

	describe('Generator', () => {
		const GeneratingBox = boxFactory(
			'GeneratingTest',
			{
				requires: ['foo'],
				provides: ['bar'],
				emits: ['baz'],
				aggregates: false,
			} as BoxMeta,
			async function processValue(
				serviceProvider: ServiceProvider,
				value: MessageData,
				emit?: (val: MessageData[], priority?: number) => void
			): Promise<any> {
				if (!emit) {
					throw TypeError(
						'GeneratingTest box method `processValue` must be invoked with `emit`!'
					);
				}
				const foo = value['foo'];
				emit([
					{bar: `${foo}1`, baz: "this value won't make it."},
					{bar: `${foo}3`, baz: "this value won't make it."},
				]);
				emit([{bar: `${foo}2`, baz: "this value won't make it."}]);
				return;
			}
		);

		const setupFunction = (): {
			box: BoxInterface | BatchingBoxInterface;
			push: (arg: any) => void;
		} => {
			const outQ = {
				push: jest.fn(),
				length: 0,
				source: '__test',
				target: '__test',
			} as PriorityQueueI<Message>;

			const box = new GeneratingBox({} as ServiceProvider, outQ);
			return {box: box, push: outQ.push};
		};

		const scenarios = [
			(setups: {box: BoxInterface | BatchingBoxInterface; push: any}) =>
				it('Generates into queue', async () => {
					const box = setups.box as BoxInterface;
					const pushMock = setups.push;
					const msg = new DataMessage({jobId: 'ggg', foo: 'hoo'});

					await box.process(msg);

					expect(pushMock).toHaveBeenCalledTimes(3);
					expect(
						pushMock.mock.calls[0][0][0].getInput([
							'foo',
							'bar',
							'baz',
						])
					).toEqual({
						foo: 'hoo',
						bar: 'hoo1',
						baz: undefined,
					});
					expect(
						pushMock.mock.calls[0][0][1].getInput([
							'foo',
							'bar',
							'baz',
						])
					).toEqual({
						foo: 'hoo',
						bar: 'hoo3',
						baz: undefined,
					});
					expect(
						pushMock.mock.calls[1][0][0].getInput([
							'foo',
							'bar',
							'baz',
						])
					).toEqual({
						foo: 'hoo',
						bar: 'hoo2',
						baz: undefined,
					});
					expect(pushMock.mock.calls[2][0].finished).toEqual(true);
					expect(pushMock.mock.calls[2][0].data).toBeUndefined();
				}),

			(setups: {box: BoxInterface | BatchingBoxInterface; push: any}) =>
				it('passes sentinel Message', async () => {
					const box = setups.box as BoxInterface;
					const pushMock = setups.push;
					const parentMsg = new DataMessage({
						jobId: 'ggg',
						foo: 'nee',
					});
					const msg = new SentinelMessage(5, parentMsg);

					await box.process(msg);
					expect(pushMock).toHaveBeenCalledTimes(1);
					expect(pushMock).toHaveBeenCalledWith(msg);
				}),
		];

		scenarios.forEach((testFn) => testFn(setupFunction()));
	});
});