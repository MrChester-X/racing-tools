import Modal from "./Modal";

interface LoadTestDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const LoadTestDataModal = ({ isOpen, onClose, onConfirm }: LoadTestDataModalProps) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-6">Загрузить тестовые данные</h2>
        
        <div className="text-gray-300 mb-8 text-left">
          <div className="mb-4">
            <p className="text-lg mb-4">Вы уверены, что хотите загрузить тестовые данные?</p>
          </div>
          
          <div className="space-y-6">
            <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4">
              <strong className="text-blue-300 text-lg block mb-3">Будет загружено:</strong>
              <ul className="space-y-1 text-blue-200">
                <li>• 24 команды с реальными названиями</li>
                <li>• Более 100 событий пит-стопов</li>
                <li>• Полная демонстрация функционала</li>
              </ul>
            </div>
            
            <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-4">
              <strong className="text-red-300 text-lg block mb-3">⚠️ Внимание:</strong>
              <ul className="space-y-1 text-red-200">
                <li>• Все текущие данные будут заменены</li>
                <li>• Текущий прогресс будет потерян</li>
                <li>• Цвета картов будут сброшены</li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="flex gap-4 justify-center">
          <button
            onClick={onClose}
            className="px-8 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors duration-200 min-w-[120px]"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200 min-w-[120px]"
          >
            Загрузить
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default LoadTestDataModal;